import "server-only";
import { z } from "zod";
import { allowedStoreUrl } from "../source-urls";
import { stores, type StoreId } from "../stores";
import { cacheSchema, type Offer } from "../offers";
import { boundedJson } from "./bounded-input";

// This endpoint ONLY contains explicitly reviewed promotions. The Worker's
// /api/coupons browser-extraction endpoint is deliberately not consumed here.
const workerOfferSchema = z.object({
  id: z.string().min(5).max(128),
  merchant: z.string().min(1).max(100),
  store_id: z.string().min(1).max(100),
  kind: z.enum([
    "coupon_code",
    "discount",
    "free_delivery",
    "catalogue_special",
    "loyalty",
    "bundle",
    "cashback",
  ]),
  title: z.string().min(5).max(160),
  criteria: z.string().min(10).max(650),
  code: z.string().min(2).max(64).nullable(),
  channel: z.enum(["online", "in_store", "both"]),
  region: z.string().min(2).max(100).nullable(),
  source_url: z.url().max(2000),
  source_evidence: z.string().min(15).max(800),
  expires_at: z.iso.datetime({ offset: true }).nullable(),
  ongoing: z.union([z.literal(0), z.literal(1)]),
  checked_at: z.iso.datetime({ offset: true }),
  valid_until: z.iso.datetime({ offset: true }),
  checkout_tested: z.union([z.literal(0), z.literal(1)]),
});
const workerResponseSchema = z.object({
  reviewedOnly: z.literal(true),
  count: z.number().int().min(0).max(500),
  offers: z.array(workerOfferSchema).max(500),
});
let lastGood: { offers: Offer[]; expiresAt: number } | undefined;

export async function readReviewedCloudflareOffers(): Promise<Offer[]> {
  const origin = process.env.CLOUDFLARE_VERIFIED_FEED_URL;
  if (!origin) return [];
  try {
    const base = new URL(origin);
    if (
      base.protocol !== "https:" ||
      base.username ||
      base.password ||
      base.pathname !== "/" ||
      base.search ||
      base.hash
    )
      throw new Error("Invalid Worker URL");
    if (lastGood && Date.now() < lastGood.expiresAt) return lastGood.offers;
    const url = new URL("/api/verified-offers", base);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) throw new Error("Reviewed feed unavailable");
    const data = workerResponseSchema.parse(await boundedJson(response, 1_600_000));
    if (data.offers.length !== data.count) throw new Error("Reviewed feed count mismatch");
    const now = Date.now();
    const mapped: Offer[] = [];
    for (const entry of data.offers) {
      const store = stores.find((item) => item.id === entry.store_id);
      if (!store || !allowedStoreUrl(entry.source_url, store)) continue;
      const checked = Date.parse(entry.checked_at);
      const valid = Date.parse(entry.valid_until);
      const expires = entry.expires_at ? Date.parse(entry.expires_at) : Infinity;
      if (
        checked > now + 60_000 ||
        checked < now - 86_400_000 ||
        valid <= now ||
        valid > checked + 86_401_000 ||
        valid > expires ||
        (entry.ongoing === 1) !== (entry.expires_at === null)
      )
        continue;
      if (entry.kind === "coupon_code" && !entry.code) continue;
      const offer: Offer = {
        id: `worker:${entry.id}`,
        storeId: store.id as StoreId,
        code: entry.code,
        type: entry.kind === "free_delivery" ? "free_delivery" : "discount",
        kind: entry.kind,
        channel: entry.channel,
        title: entry.title,
        criteria: entry.criteria,
        ...(entry.region ? { region: entry.region } : {}),
        expiresAt: entry.expires_at,
        expiryKnown: true,
        ongoing: entry.ongoing === 1,
        sourceName: entry.merchant,
        sourceUrl: entry.source_url,
        foundAt: entry.checked_at,
        checkedAt: entry.checked_at,
        validUntil: entry.valid_until,
        verified: false, // Verified retailer evidence is NOT checkout-tested.
        evidence: entry.source_evidence,
        collectionMethod: "reviewed_worker",
      };
      mapped.push(offer);
    }
    const offers = cacheSchema.shape.offers.parse(mapped);
    lastGood = { offers, expiresAt: now + 60_000 };
    return offers;
  } catch {
    // Never claim that a failed source rechecked an offer. Previous records
    // retain their original expiration and cannot be extended by this cache.
    return (lastGood?.offers ?? []).filter(
      (offer) =>
        Date.parse(offer.validUntil) > Date.now() &&
        (offer.ongoing || (offer.expiresAt && Date.parse(offer.expiresAt) > Date.now())),
    );
  }
}
