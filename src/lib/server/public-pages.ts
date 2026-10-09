import { allowedUrl } from "../source-urls";
import { boundedText } from "./bounded-input";
export { allowedUrl, allowedStoreUrl } from "../source-urls";

const agent = "LittleLess";
const headers = {
  "User-Agent": `${agent}/1.0 (+https://github.com/thembaxx/procodiapp)`,
  Accept: "text/html,application/json,text/plain",
};

export function robotsAllows(text: string, pathname: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; value: string }[] }[] = [];
  let group: (typeof groups)[number] | undefined;
  for (const line of text.split(/\r?\n/)) {
    const match = line
      .replace(/#.*/, "")
      .trim()
      .match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
    if (!match) continue;
    const field = match[1].toLowerCase(),
      value = match[2].trim();
    if (field === "user-agent") {
      if (!group || group.rules.length) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
    } else if (group && value) group.rules.push({ allow: field === "allow", value });
  }
  const specific = groups.filter((g) =>
    g.agents.some((a) => a !== "*" && agent.toLowerCase().includes(a)),
  );
  const applicable = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  const rules = applicable
    .flatMap((g) => g.rules)
    .filter((rule) => {
      const expression = rule.value
        .split("*")
        .map((part) => part.replace(/[.+?^{}()|[\]\\]/g, "\\$&"))
        .join(".*")
        .replace(/\\\$$/, "$");
      return new RegExp(`^${expression}`).test(pathname);
    })
    .sort((a, b) => b.value.length - a.value.length || Number(b.allow) - Number(a.allow));
  return rules[0]?.allow ?? true;
}

async function fetchBounded(
  url: string,
  acceptRobots = false,
  signal?: AbortSignal,
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    if (!allowedUrl(current)) throw new Error("Source is outside the approved public domains.");
    const response = await fetch(current, {
      headers,
      redirect: "manual",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(9000)])
        : AbortSignal.timeout(9000),
      cache: "no-store",
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Invalid source redirect.");
      const redirected = new URL(location, current);
      if (acceptRobots && redirected.origin !== new URL(url).origin)
        throw new Error("Robots redirect crosses origins.");
      // Candidate redirects must have their own robots policy checked separately.
      if (!acceptRobots && redirected.href !== current)
        throw new Error("Source redirected; it must be reviewed separately.");
      current = redirected.href;
      continue;
    }
    return response;
  }
  throw new Error("Too many source redirects.");
}

const policies = new Map<string, { text: string; until: number }>();
export async function readPublicPage(url: string, signal?: AbortSignal): Promise<string> {
  if (!allowedUrl(url)) throw new Error("Unsupported source.");
  const parsed = new URL(url);
  let policy = policies.get(parsed.origin);
  if (!policy || policy.until < Date.now()) {
    const response = await fetchBounded(`${parsed.origin}/robots.txt`, true, signal);
    if (!response.ok && response.status !== 404) throw new Error("Source policy unavailable.");
    policy = {
      text: response.status === 404 ? "" : await boundedText(response, 1_500_000),
      until: Date.now() + 3600_000,
    };
    policies.set(parsed.origin, policy);
  }
  if (!robotsAllows(policy.text, `${parsed.pathname}${parsed.search}`))
    throw new Error("Source does not permit automated access.");
  const response = await fetchBounded(url, false, signal);
  if (!response.ok) throw new Error("Source could not be checked.");
  if (
    !/(text\/html|application\/json|text\/plain)/.test(response.headers.get("content-type") ?? "")
  )
    throw new Error("Source is not a supported public page.");
  return stripHtml(await boundedText(response, 1_500_000)).slice(0, 55_000);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
