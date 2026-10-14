import { load } from "cheerio";
import { z } from "zod";
import type { Store } from "../stores";
import { candidateSchema, promotionId, tidy, type Candidate } from "./promotion-parser";
import type { PublicDocument } from "./public-pages";

const coupon = z.object({
  code: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/),
  headline: z.string().max(160),
  description: z.string().max(800),
  conditions: z.string().max(650).nullable(),
  source: z.object({ author: z.string().nullable().optional() }).passthrough().optional(),
});
const embedded = z.object({
  props: z.object({
    store: z.object({ primary_domain: z.literal("pnp.co.za") }),
    coupons: z.array(z.unknown()).max(100),
  }),
});

// Third-party listings are leads only. A freshness score is not a published expiry.
export function parseCouponLeads(
  store: Store,
  document: PublicDocument,
  now = Date.now(),
): Candidate[] {
  if (
    store.id !== "pnp" ||
    document.url !== "https://www.wethrift.com/codes/pnp.co.za" ||
    !document.html
  )
    return [];
  const $ = load(document.html),
    script = $("script#__D[type='application/json']").text();
  const data = embedded.parse(JSON.parse(script));
  return data.props.coupons.flatMap((item) => {
    const parsed = coupon.safeParse(item);
    if (!parsed.success) return [];
    const value = parsed.data,
      text = tidy(`${value.description} ${value.conditions ?? ""}`);
    const foreign = /[£€]|\bUAE\b|United Kingdom|Australia|New Zealand/i.test(
      `${text} ${value.source?.author ?? ""}`,
    );
    return [
      candidateSchema.parse({
        id: promotionId(store.id, `${document.url}:${value.code}`),
        storeId: store.id,
        code: value.code,
        title: value.headline,
        sourceUrl: document.url,
        evidence: text.slice(0, 800),
        reason: foreign ? "foreign_region" : "missing_expiry",
        foundAt: new Date(now).toISOString(),
      }),
    ];
  });
}
