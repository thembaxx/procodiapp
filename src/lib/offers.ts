import { z } from "zod";
import { stores } from "./stores";

// Use interpreted validators under the production CSP, without runtime eval.
z.config({ jitless: true });

export const offerSchema = z.object({
  id: z.string().min(1).max(180),
  storeId: z.enum(["checkers", "pnp", "woolworths", "shoprite", "spar", "makro"]),
  code: z.string().min(2).max(64).nullable(),
  type: z.enum(["free_delivery", "discount"]),
  title: z.string().min(5).max(160),
  criteria: z.string().min(10).max(650),
  minBasketZar: z.number().nonnegative().optional(),
  newCustomersOnly: z.boolean().optional(),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  expiryKnown: z.boolean(),
  ongoing: z.boolean(),
  sourceName: z.string().min(1).max(80),
  sourceUrl: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "Source must be a public HTTPS URL."),
  foundAt: z.iso.datetime({ offset: true }),
  checkedAt: z.iso.datetime({ offset: true }),
  validUntil: z.iso.datetime({ offset: true }),
  verified: z.boolean(),
  evidence: z.string().min(10).max(800),
});

export type Offer = z.infer<typeof offerSchema>;
export type Filter = "all" | "free_delivery" | "discount";
export type SourceCheck = {
  storeId: string;
  status: "checked" | "unavailable";
  pages: number;
  message?: string;
};
export type OffersResponse = {
  offers: Offer[];
  updatedAt: string | null;
  checks: SourceCheck[];
  newOfferIds: string[];
  mode: "public_pages" | "web_search";
};

export function isLive(offer: Offer, now = Date.now()): boolean {
  const fresh = Date.parse(offer.validUntil) > now;
  const unexpired = offer.expiresAt === null ? offer.ongoing : Date.parse(offer.expiresAt) > now;
  return fresh && unexpired && offer.expiryKnown;
}

export function filterOffers(
  offers: Offer[],
  filter: Filter = "all",
  query = "",
  now = Date.now(),
) {
  const ids = stores
    .filter((store) =>
      `${store.name} ${store.loyalty}`.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .map((store) => store.id);
  return offers.filter(
    (offer) =>
      isLive(offer, now) &&
      ids.includes(offer.storeId) &&
      (filter === "all" || offer.type === filter),
  );
}

export function deduplicate(offers: Offer[]): Offer[] {
  const unique = new Map<string, Offer>();
  for (const offer of offers) {
    const key = `${offer.storeId}:${(offer.code ?? offer.title).trim().toLowerCase()}`;
    const current = unique.get(key);
    if (!current || Date.parse(offer.checkedAt) > Date.parse(current.checkedAt))
      unique.set(key, offer);
  }
  return [...unique.values()];
}

export function expiryLabel(offer: Offer, now = new Date()) {
  if (offer.ongoing && !offer.expiresAt) return "Ongoing · no end date listed";
  if (!offer.expiresAt) return "Expiry not confirmed";
  const date = new Date(offer.expiresAt);
  const day = (value: Date) =>
    value.toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
  if (day(date) === day(now)) return "Ends today";
  if (day(date) === day(new Date(now.getTime() + 86400000))) return "Ends tomorrow";
  return `Expires ${date.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Johannesburg" })}`;
}

// A date-only expiry means the end of that calendar day in South Africa (UTC+2).
export function normaliseExpiry(value: string | null): string | null {
  if (!value) return null;
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999+02:00` : value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(candidate))
    return null;
  const time = Date.parse(candidate);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
