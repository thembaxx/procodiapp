import { createHash } from "node:crypto";
import { load } from "cheerio";
import { z } from "zod";
import { isLive, normaliseExpiry, offerSchema, type Offer } from "../offers";
import { allowedStoreUrl } from "../source-urls";
import type { Store, StoreId } from "../stores";
import type { PublicDocument } from "./public-pages";

export const DAY = 86400_000;
export const candidateSchema = z.object({
  id: z.string().max(180),
  storeId: z.enum(["checkers", "pnp", "woolworths", "shoprite", "spar", "makro"]),
  code: z.string().min(2).max(64),
  title: z.string().max(160),
  sourceUrl: z.url().max(2000),
  evidence: z.string().max(800),
  reason: z.enum(["missing_expiry", "unclear_eligibility", "foreign_region"]),
  foundAt: z.iso.datetime({ offset: true }),
});
export type Candidate = z.infer<typeof candidateSchema>;
export type ParsedPromotions = { offers: Offer[]; candidates: Candidate[] };
export type PromotionInput = {
  code: string | null;
  title: string;
  text: string;
  expiresAt?: string | null;
  startsAt?: string | null;
  country?: string;
};

export const tidy = (value: string) => value.replace(/\s+/g, " ").trim();
export function containsEvidence(text: string, evidence: string): boolean {
  return (
    evidence.trim().length >= 10 && tidy(text).toLowerCase().includes(tidy(evidence).toLowerCase())
  );
}
export function promotionId(storeId: StoreId, value: string) {
  return `${storeId}-${createHash("sha256").update(value.toLowerCase()).digest("hex").slice(0, 12)}`;
}

const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export function publishedDate(value: string): string | null {
  const direct = normaliseExpiry(value.trim());
  if (direct) return direct;
  const match = value.trim().match(/^(\d{1,2})[ /-]([a-z]+|\d{1,2})[ /-](20\d{2})$/i);
  if (!match) return null;
  const month = /^\d+$/.test(match[2])
    ? Number(match[2])
    : months.indexOf(match[2].slice(0, 3).toLowerCase()) + 1;
  return normaliseExpiry(
    `${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`,
  );
}
export function expiryFromText(text: string): string | null {
  const match = text.match(
    /(?:valid until|expires?(?: on)?|ends?(?: on)?|end date|valid through)\s*[:–-]?\s*(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?|\d{1,2}[ /-](?:[a-z]+|\d{1,2})[ /-]20\d{2})/i,
  );
  return match ? publishedDate(match[1]) : null;
}

export function evaluatePromotion(
  store: Store,
  sourceUrl: string,
  input: PromotionInput,
  now = Date.now(),
  method: "official_page" | "affiliate_api" = "official_page",
): ParsedPromotions {
  const text = tidy(input.text),
    code = input.code?.trim() || null;
  const result: ParsedPromotions = { offers: [], candidates: [] };
  if (!allowedStoreUrl(sourceUrl, store)) return result;
  const hostname = new URL(sourceUrl).hostname;
  if (
    !allowedStoreUrl(sourceUrl, store) ||
    !store.domains.some((domain) => hostname === domain || hostname === `www.${domain}`) ||
    (code && !/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/.test(code))
  )
    return result;
  if (code && !text.includes(code)) return result;
  const expiresAt = input.expiresAt ? publishedDate(input.expiresAt) : expiryFromText(text);
  if ((input.expiresAt && !expiresAt) || (expiresAt && Date.parse(expiresAt) <= now)) return result;
  if (input.startsAt) {
    if (!publishedDate(input.startsAt)) return result;
    const start = /^\d{4}-\d{2}-\d{2}$/.test(input.startsAt)
      ? Date.parse(`${input.startsAt}T00:00:00+02:00`)
      : Date.parse(input.startsAt);
    if (!Number.isFinite(start) || start > now) return result;
  }
  const foreign =
    (input.country && input.country.toUpperCase() !== "ZA") ||
    /[£€]|\b(?:UAE|United Kingdom|Australia|New Zealand)\b/i.test(text);
  const eligible =
    /groc(?:ery|eries)|\bfood\b|sixty60|asap!?|spar2u|\bdash\b/i.test(text) &&
    /online|delivery|checkout|sixty60|asap!?|spar2u|\bdash\b/i.test(text) &&
    !/in[- ]store only|competition|giveaway|personal(?:ised|ized)|single[- ]use|one[- ]time use/i.test(
      text,
    );
  if (foreign || !eligible || !expiresAt) {
    if (code)
      result.candidates.push({
        id: promotionId(store.id, `${sourceUrl}:${code}`),
        storeId: store.id,
        code,
        title: tidy(input.title).slice(0, 160),
        sourceUrl,
        evidence: text.slice(0, 800),
        reason: foreign ? "foreign_region" : !eligible ? "unclear_eligibility" : "missing_expiry",
        foundAt: new Date(now).toISOString(),
      });
    return result;
  }
  const type = /free (?:delivery|shipping)/i.test(text)
    ? "free_delivery"
    : /discount|\boff\b|\bsave\b/i.test(text)
      ? "discount"
      : null;
  // Keep all qualifying terms in one source block; do not truncate them for publication.
  if (!type || text.length < 10 || text.length > 650) return result;
  const basket = text.match(
    /(?:minimum (?:spend|basket)|min\.? spend|spend|basket of)\s*(?:of\s*)?R\s*(\d[\d,]*(?:\.\d{2})?)/i,
  );
  const record = offerSchema.safeParse({
    id: promotionId(store.id, code ?? input.title),
    storeId: store.id,
    code,
    type,
    title: tidy(input.title).slice(0, 160),
    criteria: text,
    expiresAt,
    expiryKnown: true,
    ongoing: false,
    sourceName:
      method === "affiliate_api"
        ? "CJ Affiliate"
        : new URL(sourceUrl).hostname.replace(/^www\./, ""),
    sourceUrl,
    evidence: text,
    collectionMethod: method,
    foundAt: new Date(now).toISOString(),
    checkedAt: new Date(now).toISOString(),
    validUntil: new Date(now + DAY).toISOString(),
    verified: false,
    ...(basket ? { minBasketZar: Number(basket[1].replaceAll(",", "")) } : {}),
    newCustomersOnly: /first (?:order|purchase)|new customers only|first[- ]time/i.test(text),
  });
  if (record.success && isLive(record.data, now)) result.offers.push(record.data);
  return result;
}

function stringField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (typeof record[key] === "string") return record[key] as string;
  return "";
}
export function parseOfficialDocument(
  store: Store,
  document: PublicDocument,
  now = Date.now(),
): ParsedPromotions {
  const result: ParsedPromotions = { offers: [], candidates: [] };
  const append = (input: PromotionInput) => {
    const parsed = evaluatePromotion(store, document.url, input, now);
    result.offers.push(...parsed.offers);
    result.candidates.push(...parsed.candidates);
  };
  if (!document.html) return result;
  const $ = load(document.html);
  // Only parse declarative data already present in the permitted public page.
  for (const element of $("script[type='application/ld+json']").toArray().slice(0, 10)) {
    try {
      const value: unknown = JSON.parse($(element).text());
      const visit = (item: unknown, depth: number) => {
        if (depth > 8 || !item || typeof item !== "object") return;
        if (Array.isArray(item)) {
          for (const child of item.slice(0, 30)) visit(child, depth + 1);
          return;
        }
        const record = item as Record<string, unknown>;
        if (record["@type"] === "Offer") {
          const description = stringField(record, ["description"]);
          const code =
            stringField(record, ["couponCode", "discountCode", "code"]) ||
            description.match(
              /(?:promo(?:tion)? code|coupon code|use code|code)\s*[:–-]?\s*([A-Za-z0-9_-]{2,64})/i,
            )?.[1] ||
            null;
          append({
            code,
            title: stringField(record, ["name", "title"]) || "Online grocery promotion",
            text: description,
            expiresAt: stringField(record, ["validThrough", "endDate"]),
            startsAt: stringField(record, ["validFrom", "startDate"]),
            country: stringField(record, ["eligibleRegion", "country"]) || undefined,
          });
        }
        for (const child of Object.values(record)) visit(child, depth + 1);
      };
      visit(value, 0);
    } catch {
      /* Invalid structured data does not make an offer. */
    }
  }
  $("script, style, nav, footer, noscript").remove();
  for (const element of $(
    "[data-promotion], [data-coupon-code], .promotion, .coupon, .offer, article",
  )
    .toArray()
    .slice(0, 40)) {
    const block = $(element),
      text = tidy(block.text());
    const codes = [
      ...text.matchAll(
        /(?:promo(?:tion)? code|coupon code|use code|code)\s*[:–-]?\s*([A-Za-z0-9_-]{2,64})/gi,
      ),
    ];
    // A block containing multiple offers cannot safely associate terms and dates.
    if (new Set(codes.map((match) => match[1])).size > 1) continue;
    append({
      code: block.attr("data-coupon-code") || codes[0]?.[1] || null,
      title: tidy(block.find("h1,h2,h3,h4").first().text()) || "Online grocery promotion",
      text,
      expiresAt: block.find("time[data-expiry]").attr("datetime"),
      startsAt: block.find("time[data-start]").attr("datetime"),
    });
  }
  return result;
}

export function promotionLinks(store: Store, document: PublicDocument): string[] {
  if (!document.html) return [];
  const $ = load(document.html);
  return [
    ...new Set(
      $("a[href]")
        .toArray()
        .flatMap((element) => {
          try {
            const link = $(element),
              url = new URL(link.attr("href")!, document.url);
            url.hash = "";
            if (
              !allowedStoreUrl(url.href, store) ||
              !store.domains.some((host) => url.hostname === host || url.hostname === `www.${host}`)
            )
              return [];
            return /promotion|coupon|voucher|campaign|terms|free.delivery/i.test(
              `${url.pathname} ${link.text()}`,
            )
              ? [url.href]
              : [];
          } catch {
            return [];
          }
        }),
    ),
  ].slice(0, 10);
}
