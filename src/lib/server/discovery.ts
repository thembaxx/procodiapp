import { deduplicate, isLive, type Offer, type SourceCheck } from "../offers";
import { stores, type Store } from "../stores";
import { sourceSnapshot } from "../snapshot";
import { allowedStoreUrl, readPublicDocument } from "./public-pages";
import { readCache, writeCache, type Cache } from "./storage";
import { cjConfiguration, collectCjFallback } from "./cj-fallback";
import { checkReviewedPromotions, reviewedPromotions } from "./reviewed-promotions";
import { parseOfficialDocument, promotionLinks, type Candidate } from "./promotion-parser";
import { parseCouponLeads } from "./coupon-leads";
import { searchPromotions, parseAggregatorLeads, type SearchDiscovery } from "./search-discovery";
import { BrowserRequiredError } from "./public-pages";
import { callTreg, tregConfigured, tregExtractedText } from "./treg-client";
import { extractedCouponLeads } from "./treg-review-leads";
import { searchGeminiPromotions } from "./gemini-search";
export { containsEvidence } from "./promotion-parser";

let inFlight: Promise<Cache & { newOfferIds: string[] }> | undefined;
let reviewCandidates: Candidate[] = [];
export const discoveryCandidates = () => reviewCandidates;

export function requireDiscovery() {
  // Official collection has no API keys. A partly configured fallback is an operator error.
  cjConfiguration();
}

export function discoveryUrls(store: Store, candidates: string[], previous: Offer[]): string[] {
  const queues = [
    candidates,
    previous
      .filter(
        (offer) =>
          offer.storeId === store.id && isLive(offer) && offer.collectionMethod !== "affiliate_api",
      )
      .map((offer) => offer.sourceUrl),
    [...store.sources],
  ];
  const urls = new Set<string>();
  for (let index = 0; queues.some((queue) => index < queue.length) && urls.size < 5; index++) {
    for (const queue of queues) {
      const url = queue[index];
      if (url && allowedStoreUrl(url, store)) urls.add(url);
      if (urls.size === 5) break;
    }
  }
  return [...urls];
}

async function runDiscovery(signal: AbortSignal) {
  requireDiscovery();
  const previous = await readCache();
  const gemini = await searchGeminiPromotions(signal);
  const results = await Promise.all(
    stores.map(async (store) => {
      let pages = 0;
      const reconciledSources = new Set<string>(),
        offers: Offer[] = [],
        candidates: Candidate[] = [],
        errors: string[] = [];
      let renderedPages = 0;
      const search: SearchDiscovery = await searchPromotions(store, signal, gemini).catch(() => ({
        searched: false,
        officialUrls: [] as string[],
        aggregatorUrls: [] as string[],
        candidates: [] as Candidate[],
        warning: "Web search was unavailable.",
      }));
      candidates.push(...search.candidates);
      if (search.warning) errors.push(search.warning);
      const selected = [
        ...reviewedPromotions
          .filter((item) => item.storeId === store.id)
          .map((item) => item.sourceUrl),
        ...sourceSnapshot.filter((item) => item.storeId === store.id).map((item) => item.sourceUrl),
      ];
      // Check all Gemini pages first, leaving room in the five-page budget for recovery.
      const queue = [
          ...new Set([
            ...(search.usedGemini ? search.officialUrls : []),
            ...discoveryUrls(store, [...search.officialUrls, ...selected], previous.offers),
          ]),
        ].slice(0, 5),
        attempted = new Set<string>();
      let pendingSearchFallback = search.usedGemini;
      for (let index = 0; index < queue.length && attempted.size < 5; index++) {
        const url = queue[index];
        if (attempted.has(url)) continue;
        attempted.add(url);
        if (signal.aborted) {
          errors.push("The source check deadline was reached.");
          break;
        }
        try {
          const document = await (async () => {
            try {
              return (
                gemini.documents?.find((sourceDocument) => sourceDocument.url === url) ??
                (await readPublicDocument(url, signal))
              );
            } catch (error) {
              if (
                !(error instanceof BrowserRequiredError) ||
                process.env.PROMOTION_BROWSER_FALLBACK !== "true" ||
                renderedPages >= 1
              )
                throw error;
              // Robots were checked before determining a browser was needed.
              const { readBrowserDocument } = await import("./browser-pages");
              try {
                const browserResult = await readBrowserDocument(url, signal);
                renderedPages++;
                return browserResult;
              } catch {
                // Preserve the original classification for the optional Treg
                // review-only fallback below. It has already passed robots.
                throw error;
              }
            }
          })();
          const parsed = parseOfficialDocument(store, document);
          offers.push(...checkReviewedPromotions(store, document), ...parsed.offers);
          candidates.push(...parsed.candidates);
          pages++;
          reconciledSources.add(url);
          for (const link of promotionLinks(store, document)) {
            if (!queue.includes(link) && queue.length < 5) queue.push(link);
          }
        } catch (error) {
          if (
            error instanceof BrowserRequiredError &&
            process.env.PROMOTION_TREG_EXTRACT_FALLBACK === "true" &&
            tregConfigured() &&
            !signal.aborted
          ) {
            try {
              const extracted = tregExtractedText(
                await callTreg("treg.web.extract", { url }, signal),
              );
              if (extracted) candidates.push(...extractedCouponLeads(store, url, extracted));
            } catch {
              errors.push("Optional Treg extraction was unavailable.");
            }
          }
          errors.push("Some official promotion sources could not be checked.");
        }
        if (pendingSearchFallback && search.officialUrls.every((page) => attempted.has(page))) {
          pendingSearchFallback = false;
          if (!offers.length && !signal.aborted) {
            const fallbackSearch = await searchPromotions(store, signal).catch(() => ({
              searched: false,
              officialUrls: [] as string[],
              aggregatorUrls: [] as string[],
              candidates: [] as Candidate[],
              warning: "Web search was unavailable.",
            }));
            search.searched ||= fallbackSearch.searched;
            search.aggregatorUrls.push(...fallbackSearch.aggregatorUrls);
            candidates.push(...fallbackSearch.candidates);
            if (fallbackSearch.warning) errors.push(fallbackSearch.warning);
            const remaining = [
              ...new Set([...fallbackSearch.officialUrls, ...queue.slice(index + 1)]),
            ]
              .filter((page) => !attempted.has(page))
              .slice(0, 5 - attempted.size);
            queue.splice(index + 1, queue.length - index - 1, ...remaining);
          }
        }
      }
      // Coupon aggregators are only reviewed leads; never publish their content directly.
      const aggregateUrls = [
        ...new Set([
          ...(store.id === "pnp" ? ["https://www.wethrift.com/codes/pnp.co.za"] : []),
          ...search.aggregatorUrls,
        ]),
      ].slice(0, 2);
      for (const leadUrl of aggregateUrls) {
        if (signal.aborted) break;
        try {
          const document = await readPublicDocument(leadUrl, signal);
          if (store.id === "pnp" && leadUrl === "https://www.wethrift.com/codes/pnp.co.za") {
            try {
              candidates.push(...parseCouponLeads(store, document));
            } catch {
              /* Other layouts */
            }
          }
          candidates.push(...parseAggregatorLeads(store, document));
        } catch {
          errors.push("An optional coupon review source could not be checked.");
        }
      }
      let fallback: NonNullable<SourceCheck["fallback"]> = "not_needed",
        fallbackOffers = 0;
      if (!pages || !offers.some((offer) => offer.code)) {
        try {
          const parsed = await collectCjFallback(store, signal);
          if (parsed) {
            fallback = "checked";
            fallbackOffers = parsed.offers.length;
            offers.push(...parsed.offers);
            candidates.push(...parsed.candidates);
          } else fallback = "unconfigured";
        } catch {
          fallback = "unavailable";
          errors.push("The free affiliate fallback could not be checked.");
        }
      }
      const check: SourceCheck = {
        storeId: store.id,
        status: pages || fallback === "checked" ? "checked" : "unavailable",
        pages,
        parsedPages: pages,
        searched: search.searched,
        extractedPages: renderedPages,
        fallback,
        fallbackOffers,
        candidates: Math.min(candidates.length, 100),
        ...(errors.length ? { message: [...new Set(errors)].join(" ").slice(0, 250) } : {}),
      };
      return { offers, candidates, check, reconciledSources };
    }),
  );
  const found = deduplicate(results.flatMap((result) => result.offers)).map((offer) => {
    const known = previous.offers.find((old) => old.id === offer.id);
    return known ? { ...offer, foundAt: known.foundAt } : offer;
  });
  const offers = deduplicate([
    ...previous.offers.filter((offer) => {
      if (!isLive(offer)) return false;
      const result = results.find((item) => item.check.storeId === offer.storeId)!;
      if (offer.collectionMethod === "affiliate_api") return result.check.fallback !== "checked";
      return !result.reconciledSources.has(offer.sourceUrl);
    }),
    ...found,
  ])
    .sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt))
    .slice(0, 500);
  const oldKeys = new Set(
    previous.offers.map((offer) => `${offer.storeId}:${(offer.code ?? offer.title).toLowerCase()}`),
  );
  const newOfferIds = found
    .filter(
      (offer) =>
        offers.some((retained) => retained.id === offer.id) &&
        !oldKeys.has(`${offer.storeId}:${(offer.code ?? offer.title).toLowerCase()}`),
    )
    .map((offer) => offer.id);
  reviewCandidates = [
    ...new Map(
      results.flatMap((result) => result.candidates).map((item) => [item.id, item]),
    ).values(),
  ].slice(0, 100);
  const cache: Cache = {
    offers,
    updatedAt: results.some((result) => result.check.status === "checked")
      ? new Date().toISOString()
      : previous.updatedAt,
    checks: results.map((result) => result.check),
    mode: "free_sources",
  };
  await writeCache(cache);
  return { ...cache, newOfferIds };
}

export async function discoverOffers() {
  if (!inFlight)
    inFlight = runDiscovery(AbortSignal.timeout(90_000)).finally(() => {
      inFlight = undefined;
    });
  return inFlight;
}
