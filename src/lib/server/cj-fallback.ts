import { load } from "cheerio";
import { z } from "zod";
import { allowedStoreUrl } from "../source-urls";
import type { Store } from "../stores";
import { boundedText } from "./bounded-input";
import { evaluatePromotion, tidy, type ParsedPromotions } from "./promotion-parser";

// Official contract: https://developers.cj.com/docs/rest-apis/link-search
const endpoint = "https://link-search.api.cj.com/v2/link-search";
const advertiserSchema = z
  .object({
    checkers: z
      .array(z.string().regex(/^[1-9]\d{0,15}$/))
      .max(5)
      .optional(),
    pnp: z
      .array(z.string().regex(/^[1-9]\d{0,15}$/))
      .max(5)
      .optional(),
    woolworths: z
      .array(z.string().regex(/^[1-9]\d{0,15}$/))
      .max(5)
      .optional(),
    shoprite: z
      .array(z.string().regex(/^[1-9]\d{0,15}$/))
      .max(5)
      .optional(),
    spar: z
      .array(z.string().regex(/^[1-9]\d{0,15}$/))
      .max(5)
      .optional(),
    makro: z
      .array(z.string().regex(/^[1-9]\d{0,15}$/))
      .max(5)
      .optional(),
  })
  .strict();

export function cjConfiguration() {
  const token = process.env.CJ_API_TOKEN ?? "",
    websiteId = process.env.CJ_WEBSITE_ID ?? "";
  const advertisers = process.env.CJ_ADVERTISERS ?? "";
  if (!token && !websiteId && !advertisers) return null;
  if (!token || !/^[1-9]\d{0,15}$/.test(websiteId) || !advertisers)
    throw new Error("CJ fallback needs its token, website ID and advertiser mapping together.");
  return { token, websiteId, advertisers: advertiserSchema.parse(JSON.parse(advertisers)) };
}

function cjDate(value: string) {
  if (!value || value.toLowerCase() === "null" || value.toLowerCase() === "ongoing") return null;
  // CJ documents timestamps as UTC, unlike South African page date-only expiries.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) return `${value}Z`;
  return value;
}

export function parseCjResponse(
  xml: string,
  store: Store,
  ids: readonly string[],
  now = Date.now(),
): ParsedPromotions & { total: number } {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Unsupported affiliate XML.");
  const $ = load(xml, { xml: true });
  const links = $("cj-api > links");
  if (links.length !== 1 || $("error").length) throw new Error("Invalid affiliate response.");
  const total = Number(links.attr("total-matched"));
  const returned = Number(links.attr("records-returned"));
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    !Number.isSafeInteger(returned) ||
    returned !== links.children("link").length ||
    returned > 100
  )
    throw new Error("Invalid affiliate pagination.");
  const result: ParsedPromotions & { total: number } = { offers: [], candidates: [], total };
  for (const element of links.children("link").toArray()) {
    const link = $(element),
      field = (name: string) => link.children(name).text().trim();
    const destination = field("destination"),
      countries = field("targeted-countries")
        .toUpperCase()
        .split(/[,\s]+/);
    // Credentials only go to CJ. Tracking redirects are never followed to discover a destination.
    if (
      !ids.includes(field("advertiser-id")) ||
      field("relationship-status").toLowerCase() !== "joined" ||
      !countries.includes("ZA") ||
      !allowedStoreUrl(destination, store) ||
      !store.domains.some(
        (domain) =>
          new URL(destination).hostname === domain ||
          new URL(destination).hostname === `www.${domain}`,
      )
    )
      continue;
    const code = field("coupon-code");
    if (!code || code.toLowerCase() === "null" || field("mobile-app-download") === "true") continue;
    const description = tidy(field("description"));
    const end = cjDate(field("promotion-end-date")),
      start = cjDate(field("promotion-start-date"));
    const parsed = evaluatePromotion(
      store,
      destination,
      {
        code,
        title: field("link-name"),
        text: `${description} Code: ${code}${end ? `. Expires: ${end}` : ""}`,
        expiresAt: end,
        startsAt: start,
        country: "ZA",
      },
      now,
      "affiliate_api",
    );
    result.offers.push(...parsed.offers);
    result.candidates.push(...parsed.candidates);
  }
  return result;
}

export async function collectCjFallback(
  store: Store,
  signal: AbortSignal,
): Promise<ParsedPromotions | null> {
  const configuration = cjConfiguration(),
    ids = configuration?.advertisers[store.id];
  if (!configuration || !ids?.length) return null;
  const result: ParsedPromotions = { offers: [], candidates: [] };
  const recordsPerPage = 100;
  for (let page = 1; page <= 3; page++) {
    const url = new URL(endpoint);
    url.search = new URLSearchParams({
      "website-id": configuration.websiteId,
      "advertiser-ids": ids.join(","),
      "promotion-type": "coupon",
      "targeted-country": "ZA",
      "records-per-page": String(recordsPerPage),
      "page-number": String(page),
    }).toString();
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${configuration.token}`, Accept: "application/xml" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    });
    if (!response.ok) throw new Error("Free affiliate fallback is unavailable.");
    const parsed = parseCjResponse(await boundedText(response, 1_000_000), store, ids);
    result.offers.push(...parsed.offers);
    result.candidates.push(...parsed.candidates);
    if (parsed.total <= page * recordsPerPage) return result;
    // Avoid CJ's documented 25 requests/minute cap, even across six configured stores.
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
      };
      const abort = () => {
        done();
        reject(new Error("Discovery deadline reached."));
      };
      const timer = setTimeout(() => {
        done();
        resolve();
      }, 2500);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  // A truncated response must not remove offers that may be on later pages.
  throw new Error("Affiliate results exceeded the bounded page budget.");
}
