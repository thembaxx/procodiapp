import type { Store } from "../stores";
import { allowedStoreUrl } from "../source-urls";
import { candidateSchema, promotionId, tidy, type Candidate } from "./promotion-parser";

/**
 * External page extraction may be incomplete or synthesized by a provider.
 * Never publish an offer from it. Return review candidates with source URLs
 * so a human can confirm the code and terms on the official retailer page.
 */
export function extractedCouponLeads(store: Store, sourceUrl: string, text: string): Candidate[] {
  if (!allowedStoreUrl(sourceUrl, store)) return [];
  const hostname = new URL(sourceUrl).hostname;
  if (!store.domains.some((domain) => hostname === domain || hostname === `www.${domain}`))
    return [];
  const matches = [
    ...text.matchAll(
      /(?:promo(?:tion)?|voucher|coupon|discount)\s*code\s*[:–-]?\s*["']?([A-Z0-9][A-Z0-9_-]{2,31})\b|\buse\s+code\s+["']?([A-Z0-9][A-Z0-9_-]{2,31})\b/gi,
    ),
  ];
  const candidates = new Map<string, Candidate>();
  for (const match of matches.slice(0, 20)) {
    const code = (match[1] ?? match[2])?.toUpperCase();
    if (!code) continue;
    const excerpt = tidy(text.slice(Math.max(0, match.index - 150), match.index + 500));
    const record = candidateSchema.safeParse({
      id: promotionId(store.id, `${sourceUrl}:${code}`),
      storeId: store.id,
      code,
      title: `Potential ${store.shortName} promo code`,
      sourceUrl,
      evidence: excerpt.slice(0, 800),
      reason: "unverified_third_party",
      foundAt: new Date().toISOString(),
    });
    if (record.success) candidates.set(record.data.id, record.data);
  }
  return [...candidates.values()].slice(0, 5);
}
