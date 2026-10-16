import { z } from "zod";
import { load } from "cheerio";
import type { PublicDocument } from "./public-pages";
import type { Store } from "../stores";
import { allowedStoreUrl } from "../source-urls";
import { boundedJson } from "./bounded-input";
import { candidateSchema, promotionId, tidy, type Candidate } from "./promotion-parser";

const braveResults = z
  .object({
    web: z
      .object({
        results: z
          .array(
            z
              .object({
                title: z.string(),
                url: z.string(),
                description: z.string().nullish(),
              })
              .passthrough(),
          )
          .max(30)
          .optional(),
      })
      .nullish(),
  })
  .passthrough();

const CODE =
  /(?:promo(?:tion)?|voucher|coupon|discount)\s*code\s*[:–-]?\s*["']?([A-Z0-9][A-Z0-9_-]{2,31})\b|\buse\s+code\s+["']?([A-Z0-9][A-Z0-9_-]{2,31})\b/i;

export type SearchDiscovery = {
  searched: boolean;
  officialUrls: string[];
  aggregatorUrls: string[];
  candidates: Candidate[];
  warning?: string;
};

export function searchLead(
  store: Store,
  item: { title: string; url: string; description?: string },
  now = Date.now(),
): Candidate | null {
  let url: URL;
  try {
    url = new URL(item.url);
  } catch {
    return null;
  }
  // Never fetch arbitrary web-search hits. Only approved retailer / aggregator
  // URLs may later be crawled; these third-party snippets are review leads.
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    item.url.length > 2000 ||
    !/^[a-z0-9.-]+$/i.test(url.hostname)
  )
    return null;
  const combined = tidy(`${item.title} ${item.description ?? ""}`).slice(0, 800);
  const match = combined.match(CODE);
  const code = match?.[1] ?? match?.[2];
  if (
    !code ||
    (allowedStoreUrl(item.url, store) &&
      store.domains.some((host) => url.hostname === host || url.hostname === `www.${host}`))
  )
    return null;
  const result = candidateSchema.safeParse({
    id: promotionId(store.id, `${item.url}:${code}`),
    storeId: store.id,
    code,
    title: tidy(item.title).slice(0, 160) || "Unconfirmed coupon",
    sourceUrl: item.url,
    evidence: combined,
    reason: "unverified_third_party",
    foundAt: new Date(now).toISOString(),
  });
  return result.success ? result.data : null;
}

export function classifySearchResults(
  store: Store,
  items: { title: string; url: string; description?: string }[],
  now = Date.now(),
): Omit<SearchDiscovery, "searched"> {
  const officialUrls = new Set<string>();
  const aggregatorUrls = new Set<string>();
  // Search API snippets are transient routing signals, not stored content.
  // Save evidence only after independently fetching permitted source pages.
  const candidates: Candidate[] = [];
  for (const item of items.slice(0, 16)) {
    if (allowedStoreUrl(item.url, store)) {
      const host = new URL(item.url).hostname;
      if (store.domains.some((domain) => host === domain || host === `www.${domain}`))
        officialUrls.add(item.url);
      else aggregatorUrls.add(item.url);
    }
  }
  void now;
  return {
    officialUrls: [...officialUrls].slice(0, 3),
    aggregatorUrls: [...aggregatorUrls].slice(0, 2),
    candidates: [
      ...new Map(candidates.map((candidate) => [candidate.id, candidate])).values(),
    ].slice(0, 20),
  };
}

// Respect conservative one-request-per-second plans across parallel retailers.
let searchTurn: Promise<void> = Promise.resolve();
let lastQueryAt = 0;
async function paceQueries(signal: AbortSignal): Promise<void> {
  const turn = searchTurn.then(async () => {
    const wait = Math.max(0, lastQueryAt + 1100 - Date.now());
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    signal.throwIfAborted();
    lastQueryAt = Date.now();
  });
  searchTurn = turn.catch(() => {});
  await turn;
}

export async function searchPromotions(
  store: Store,
  signal: AbortSignal,
): Promise<SearchDiscovery> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!apiKey) return { searched: false, officialUrls: [], aggregatorUrls: [], candidates: [] };
  const month = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    month: "long",
    year: "numeric",
  }).format(new Date());
  const queries = [
    `site:${store.domains[0]} ("promo code" OR "voucher" OR "free delivery")`,
    `"${store.shortName}" grocery delivery coupon South Africa ${month}`,
  ];
  const items: { title: string; url: string; description?: string }[] = [];
  let successful = 0;
  for (const query of queries) {
    signal.throwIfAborted();
    try {
      await paceQueries(signal);
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query);
      url.searchParams.set("count", "8");
      url.searchParams.set("country", "ZA");
      url.searchParams.set("search_lang", "en");
      const response = await fetch(url, {
        headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) throw new Error("Search service unavailable.");
      const parsed = braveResults.parse(await boundedJson(response, 150_000));
      items.push(
        ...(parsed.web?.results ?? []).map((item) => ({
          title: item.title,
          url: item.url,
          ...(item.description ? { description: item.description } : {}),
        })),
      );
      successful++;
    } catch {
      if (signal.aborted) throw new Error("Discovery deadline reached.");
    }
  }
  const grouped = classifySearchResults(store, items);
  return {
    searched: successful > 0,
    ...grouped,
    ...(successful !== queries.length
      ? { warning: "Some web-search queries were unavailable." }
      : {}),
  };
}

/** Parse permitted coupon aggregators only. Never publish their claims as offers. */
export function parseAggregatorLeads(store: Store, document: PublicDocument): Candidate[] {
  if (!allowedStoreUrl(document.url, store) || !document.html) return [];
  const host = new URL(document.url).hostname;
  if (!["wethrift.com", "www.wethrift.com", "picodi.com", "www.picodi.com"].includes(host))
    return [];
  const $ = load(document.html);
  $("script,style,nav,footer,noscript").remove();
  const results: Candidate[] = [];
  for (const element of $("[data-code],[data-coupon-code],.coupon,article,.offer")
    .toArray()
    .slice(0, 35)) {
    const block = $(element);
    const text = tidy(block.text()).slice(0, 600);
    const title = tidy(block.find("h1,h2,h3,h4").first().text()).slice(0, 160);
    const code = block.attr("data-code") ?? block.attr("data-coupon-code");
    const snippet = code ? `Use code ${code}. ${text}` : text;
    const lead = searchLead(store, {
      url: document.url,
      title: title || `${store.shortName} coupon candidate`,
      description: snippet,
    });
    if (lead) results.push(lead);
  }
  return [...new Map(results.map((item) => [item.id, item])).values()].slice(0, 20);
}
