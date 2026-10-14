import { describe, expect, it } from "vitest";
import { stores } from "../../src/lib/stores";
import {
  evaluatePromotion,
  expiryFromText,
  parseOfficialDocument,
  promotionLinks,
} from "../../src/lib/server/promotion-parser";
import { parseCouponLeads } from "../../src/lib/server/coupon-leads";
import { checkReviewedPromotions } from "../../src/lib/server/reviewed-promotions";
import { sourceSnapshot } from "../../src/lib/snapshot";

const now = Date.parse("2026-10-14T12:00:00Z"),
  store = stores[1];
const description =
  "South African online groceries: save R50 using code TEST50. Minimum spend R500. New customers only. Expires on 31 December 2099. Delivery areas and product exclusions apply.";
const document = (html: string) => ({
  url: "https://www.pnp.co.za/terms",
  html,
  text: description,
});

describe("deterministic offer extraction", () => {
  it("extracts actual code, conditions and South African date-only expiry without a model", () => {
    const parsed = parseOfficialDocument(
      store,
      document(
        `<article><h2>R50 off online groceries</h2><p>${description}</p></article><script>invent code FAKE99</script>`,
      ),
      now,
    );
    expect(parsed.offers).toHaveLength(1);
    expect(parsed.offers[0]).toMatchObject({
      code: "TEST50",
      minBasketZar: 500,
      newCustomersOnly: true,
      expiresAt: "2099-12-31T21:59:59.999Z",
      verified: false,
      collectionMethod: "official_page",
    });
    expect(parsed.offers[0].validUntil).toBe("2026-10-15T12:00:00.000Z");
    expect(parsed.candidates).toEqual([]);
  });
  it("reads declarative structured offers without executing embedded scripts", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "Offer", name: "R50 grocery discount", couponCode: "TEST50", description, validThrough: "2099-12-31", eligibleRegion: "ZA" })}</script>`;
    expect(parseOfficialDocument(store, document(html), now).offers[0]?.code).toBe("TEST50");
  });
  it("queues unknown-expiry codes and rejects expired, impossible-date, future and foreign offers", () => {
    const input = { code: "TEST50", title: "R50 grocery discount", text: description };
    expect(
      evaluatePromotion(
        store,
        document("").url,
        { ...input, text: description.replace("Expires on 31 December 2099.", "") },
        now,
      ).candidates[0]?.reason,
    ).toBe("missing_expiry");
    for (const expiresAt of ["2000-01-01", "2099-02-30"])
      expect(
        evaluatePromotion(store, document("").url, { ...input, expiresAt }, now).offers,
      ).toEqual([]);
    expect(
      evaluatePromotion(store, document("").url, { ...input, startsAt: "2099-01-01" }, now).offers,
    ).toEqual([]);
    expect(
      evaluatePromotion(store, document("").url, { ...input, country: "AU" }, now).candidates[0]
        ?.reason,
    ).toBe("foreign_region");
    expect(
      evaluatePromotion(
        store,
        document("").url,
        { ...input, text: description + " In-store only." },
        now,
      ).offers,
    ).toEqual([]);
    expect(
      evaluatePromotion(store, document("").url, { ...input, code: "INVENTED" }, now).offers,
    ).toEqual([]);
  });
  it("does not associate one date with multiple coupons or use arbitrary page dates", () => {
    const parsed = parseOfficialDocument(
      store,
      document(
        `<article><h2>Discounts</h2>${description}<p>Code OTHER50: online groceries.</p></article>`,
      ),
      now,
    );
    expect(parsed.offers).toEqual([]);
    expect(expiryFromText("Page updated 2099-12-31; online grocery code TEST50.")).toBeNull();
  });
  it("discovers only approved retailer campaign links, excluding private hosts and foreign merchants", () => {
    const links = promotionLinks(
      store,
      document(
        '<a href="/terms/new-coupon">Coupon terms</a><a href="https://127.0.0.1/terms">Terms</a><a href="https://wethrift.com/amazon">Coupon</a><a href="https://www.makro.co.za/coupon">Coupon</a>',
      ),
    );
    expect(links).toEqual(["https://www.pnp.co.za/terms/new-coupon"]);
  });
  it("checks known benefit evidence beyond the former text truncation without renewing missing evidence", () => {
    const known = sourceSnapshot[2];
    const text =
      "Text ".repeat(15_000) +
      known.evidence +
      "; Age 60 years; online Website. Excludes marketplace, liquor and baby formula.";
    const doc = { url: known.sourceUrl, text, html: null };
    expect(checkReviewedPromotions(stores[5], doc, now)[0]?.id).toBe(known.id);
    expect(
      checkReviewedPromotions(stores[5], { ...doc, text: "Generic loyalty information" }, now),
    ).toEqual([]);
  });
});

it("reads only current Pick n Pay lead rows and never publishes their unconfirmed expiry", () => {
  const html = `<script id="__D" type="application/json">${JSON.stringify({ props: { store: { primary_domain: "pnp.co.za" }, coupons: [{ code: "LEAD50", headline: "Grocery lead", description: "R50 off online groceries with LEAD50", conditions: "Minimum spend R500", source: { author: "Pick n Pay" } }], expiredCoupons: [{ code: "EXPIRED50" }] } })}</script>`;
  const candidates = parseCouponLeads(
    store,
    { url: "https://www.wethrift.com/codes/pnp.co.za", html, text: "" },
    now,
  );
  expect(candidates).toHaveLength(1);
  expect(candidates[0]).toMatchObject({ code: "LEAD50", reason: "missing_expiry" });
  expect(
    parseCouponLeads(
      stores[4],
      { url: "https://www.wethrift.com/codes/spar.co.za", html, text: "" },
      now,
    ),
  ).toEqual([]);
});
