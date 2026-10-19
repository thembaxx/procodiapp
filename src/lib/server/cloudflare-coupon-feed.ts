import "server-only";
import { z } from "zod";
import { stores, type StoreId } from "../stores";
import { allowedStoreUrl } from "../source-urls";

// Browser extraction is a lead, not proof of a working coupon.
// Keep all returned rows out of public offers until verified against primary sources.
const rowSchema = z.object({
  id: z.string().min(1).max(128),
  code: z.string().max(64).nullable(),
  merchant: z.string().min(1).max(100),
  title: z.string().max(200).nullable(),
  description: z.string().max(4000).nullable(),
  discount: z.string().max(200).nullable(),
  source_url: z.url().max(2000),
  found_at: z.iso.datetime({ offset: true }),
  expires_at: z.string().max(40).nullable(),
});
const feedSchema = z.object({
  count: z.number().int().nonnegative().max(500),
  coupons: z.array(rowSchema).max(500),
});
export type CloudflareCouponLead = z.infer<typeof rowSchema> & { storeId: StoreId };

const merchantMap: Record<string, StoreId | undefined> = {
  "Pick n Pay": "pnp",
  "Pick n Pay ASAP": "pnp",
  ShopRite: "shoprite",
  Makro: "makro",
  Woolworths: "woolworths",
  Checkers: "checkers",
  SPAR: "spar",
};

export async function readCloudflareCouponLeads(
  signal?: AbortSignal,
): Promise<{ status: "disabled" | "unavailable" | "ok"; leads: CloudflareCouponLead[] }> {
  const base = process.env.CLOUDFLARE_COUPON_API_URL;
  if (!base) return { status: "disabled", leads: [] };
  let url: URL;
  try {
    url = new URL("/api/coupons?active=true&limit=500", base);
    if (url.protocol !== "https:" || url.username || url.password)
      return { status: "unavailable", leads: [] };
  } catch {
    return { status: "unavailable", leads: [] };
  }
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
        : AbortSignal.timeout(8000),
    });
    if (!response.ok) return { status: "unavailable", leads: [] };
    const data = feedSchema.safeParse(await response.json());
    if (!data.success || data.data.count !== data.data.coupons.length)
      return { status: "unavailable", leads: [] };
    const now = Date.now();
    const leads: CloudflareCouponLead[] = [];
    const seen = new Set<string>();
    for (const row of data.data.coupons) {
      const storeId = merchantMap[row.merchant];
      const store = stores.find((item) => item.id === storeId);
      if (!store || !allowedStoreUrl(row.source_url, store)) continue;
      const found = Date.parse(row.found_at);
      if (!Number.isFinite(found) || found > now + 60000 || now - found > 86400_000) continue;
      if (row.expires_at) {
        const expiry = Date.parse(row.expires_at);
        if (!Number.isFinite(expiry) || expiry < now) continue;
      }
      const key = [storeId, row.code ?? row.title, row.source_url].join("|").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      leads.push({ ...row, storeId: store.id });
    }
    return { status: "ok", leads };
  } catch {
    return { status: "unavailable", leads: [] };
  }
}
