import { allowedUrl } from "../source-urls";
import { boundedBytes, boundedText } from "./bounded-input";
import { load } from "cheerio";
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
export type PublicDocument = { url: string; text: string; html: string | null };
export class BrowserRequiredError extends Error {}

export async function ensureRobotsAllowed(url: string, signal?: AbortSignal): Promise<void> {
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
}

export async function readPublicDocument(
  url: string,
  signal?: AbortSignal,
): Promise<PublicDocument> {
  await ensureRobotsAllowed(url, signal);
  const response = await fetchBounded(url, false, signal);
  if (!response.ok) throw new Error("Source could not be checked.");
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/pdf")) {
    const bytes = await boundedBytes(response, 2_500_000);
    signal?.throwIfAborted();
    const { getDocumentProxy, extractText } = await import("unpdf");
    const options = { isEvalSupported: false, maxImageSize: 1_000_000, verbosity: 0 };
    const pdf = await getDocumentProxy(bytes, options);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (pdf.numPages > 40) throw new Error("Source PDF is too long.");
      const result = await Promise.race([
        extractText(pdf, { mergePages: true }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Source PDF deadline exceeded.")), 5000);
        }),
      ]);
      signal?.throwIfAborted();
      return { url, text: result.text.replace(/\s+/g, " ").trim(), html: null };
    } finally {
      clearTimeout(timer);
      await pdf.loadingTask.destroy();
    }
  }
  if (!/(text\/html|application\/json|text\/plain)/.test(contentType))
    throw new Error("Source is not a supported public page.");
  const html = await boundedText(response, 2_500_000);
  const text = stripHtml(html);
  if (/access denied|verify you are human|captcha/i.test(text))
    throw new Error("Public source denied automated access.");
  if (text.length < 100 || /enable javascript to continue/i.test(text))
    throw new BrowserRequiredError("Page needs JavaScript rendering.");
  return { url, html, text };
}

export async function readPublicPage(url: string, signal?: AbortSignal): Promise<string> {
  return (await readPublicDocument(url, signal)).text;
}

export function stripHtml(html: string): string {
  const $ = load(html);
  $("script, style, nav, footer, noscript").remove();
  $("p, div, section, article, li, h1, h2, h3, br, td, tr").prepend(" ").append(" ");
  return $.root().text().replace(/\s+/g, " ").trim();
}
