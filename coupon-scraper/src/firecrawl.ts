import type { Coupon, ScrapeTarget } from "./types";

export interface FirecrawlEnv {
  DB: D1Database;
  FIRECRAWL_API_KEY?: string;
  FIRECRAWL_ENABLED?: string;
  FIRECRAWL_DAILY_LIMIT?: string;
}
type ParseCoupon = (
  text: string,
  merchant: string,
  sourceUrl: string,
  now: string,
) => Promise<Coupon[]>;

/** Global daily reservation across all Worker queue consumers, not a per-isolate counter. */
async function reserveCredit(env: FirecrawlEnv): Promise<boolean> {
  const configured = Number(env.FIRECRAWL_DAILY_LIMIT ?? "6");
  const limit = Number.isSafeInteger(configured) ? Math.max(0, Math.min(12, configured)) : 0;
  if (!limit) return false;
  const date = new Date().toISOString().slice(0, 10);
  const reserved = await env.DB.prepare(
    "INSERT INTO firecrawl_usage (day, requests) VALUES (?,1) " +
      "ON CONFLICT(day) DO UPDATE SET requests=requests+1 WHERE requests < ? " +
      "RETURNING requests",
  )
    .bind(date, limit)
    .first<{ requests: number }>();
  return !!reserved;
}

function exactSource(actual: unknown, expected: string): boolean {
  if (typeof actual !== "string") return false;
  try {
    const source = new URL(actual);
    const requested = new URL(expected);
    return (
      source.protocol === "https:" &&
      !source.username &&
      !source.password &&
      !source.hash &&
      source.origin === requested.origin &&
      source.pathname.replace(/\/$/, "") === requested.pathname.replace(/\/$/, "") &&
      source.search === requested.search
    );
  } catch {
    return false;
  }
}

/** Conservatively honor robots instructions before asking a third-party provider. */
export function robotsPermit(text: string, pathname: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let group: (typeof groups)[number] | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.replace(/#.*/, "").trim().match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
    if (!match) continue;
    const type = match[1].toLowerCase();
    const value = match[2].trim();
    if (type === "user-agent") {
      if (!group || group.rules.length) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
    } else if (group && value) {
      group.rules.push({ allow: type === "allow", path: value });
    }
  }
  const matched = groups.filter((item) => item.agents.includes("firecrawl"));
  const applicable = matched.length ? matched : groups.filter((item) => item.agents.includes("*"));
  const matching = applicable
    .flatMap((item) => item.rules)
    .filter((item) => {
      const expression = item.path
        .split("*")
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*");
      try {
        return new RegExp("^" + expression).test(pathname);
      } catch {
        return false;
      }
    })
    .sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return matching[0]?.allow ?? true;
}

async function permittedByRobots(url: URL): Promise<boolean> {
  try {
    const response = await fetch(new URL("/robots.txt", url.origin), {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404) return true;
    if (!response.ok) return false;
    if (Number(response.headers.get("content-length") ?? 0) > 100_000) return false;
    const text = await response.text();
    return text.length <= 100_000 && robotsPermit(text, url.pathname + url.search);
  } catch {
    return false;
  }
}

/**
 * Credit-bounded rescue for browser errors/empty results. A fixed, operator-selected
 * retailer target is the only allowed input. Results remain UNVERIFIED D1 coupon leads.
 *
 * null means disabled, disallowed or out of budget; [] means a completed empty scrape.
 */
export async function scrapeFirecrawlLeads(
  env: FirecrawlEnv,
  target: ScrapeTarget,
  parse: ParseCoupon,
  now: string,
): Promise<Coupon[] | null> {
  const key = env.FIRECRAWL_API_KEY?.trim();
  if (env.FIRECRAWL_ENABLED !== "true" || !key) return null;
  let url: URL;
  try {
    url = new URL(target.url);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !/^[a-z0-9.-]+$/i.test(url.hostname)
  )
    return null;
  if (!(await permittedByRobots(url))) return null;
  // Reserve BEFORE the API request, including unsuccessful calls. Never retry
  // here: the daily ceiling is a hard upper bound on billable attempts.
  if (!(await reserveCredit(env))) return null;
  const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      url: target.url,
      formats: ["markdown"],
      onlyMainContent: true,
      proxy: "basic",
      timeout: 12000,
    }),
    signal: AbortSignal.timeout(16000),
  });
  if (!response.ok || Number(response.headers.get("content-length") ?? 0) > 800_000)
    throw new Error("Firecrawl was unavailable.");
  const raw = await response.text();
  if (raw.length > 800_000) throw new Error("Firecrawl result exceeded the size limit.");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Firecrawl returned invalid JSON.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Firecrawl returned an invalid response.");
  const result = data as { success?: unknown; data?: { markdown?: unknown; metadata?: { sourceURL?: unknown } } };
  const markdown = result.data?.markdown;
  if (
    result.success !== true ||
    !exactSource(result.data?.metadata?.sourceURL, target.url) ||
    typeof markdown !== "string" ||
    markdown.length > 400_000 ||
    /access denied|verify you are human|captcha/i.test(markdown.slice(0, 500))
  )
    throw new Error("Firecrawl did not return approved retailer content.");
  const unique = new Map<string, Coupon>();
  for (const paragraph of markdown.split(/\n\s*\n/).slice(0, 120)) {
    const text = paragraph.replace(/\s+/g, " ").trim();
    if (text.length < 12 || text.length > 4000) continue;
    for (const lead of await parse(text, target.merchant, target.url, now))
      unique.set(lead.id, lead);
    if (unique.size >= 50) break;
  }
  return [...unique.values()];
}
