import { describe, expect, it } from "vitest";
import {
  deduplicate,
  expiryLabel,
  filterOffers,
  isLive,
  normaliseExpiry,
  offerSchema,
} from "../../src/lib/offers";
import { sourceSnapshot } from "../../src/lib/snapshot";
import { allowedUrl, robotsAllows, stripHtml } from "../../src/lib/server/public-pages";
import { containsEvidence } from "../../src/lib/server/discovery";

const now = Date.parse("2026-10-08T21:00:00.000Z");
const offer = sourceSnapshot[0];

describe("promotion validity", () => {
  it("accepts a current recurring benefit but excludes stale, expired and unknown-expiry offers", () => {
    expect(isLive(offer, now)).toBe(true);
    expect(isLive({ ...offer, validUntil: "2026-10-08T20:00:00Z" }, now)).toBe(false);
    expect(isLive({ ...offer, expiresAt: "2026-10-08T20:00:00Z" }, now)).toBe(false);
    expect(isLive({ ...offer, ongoing: false }, now)).toBe(false);
    expect(isLive({ ...offer, expiryKnown: false }, now)).toBe(false);
    expect(isLive({ ...offer, expiresAt: new Date(now).toISOString() }, now)).toBe(false);
  });
  it("combines search, category and expiry filtering", () => {
    expect(
      filterOffers(sourceSnapshot, "free_delivery", "CHECKERS", now).map((item) => item.id),
    ).toEqual([offer.id]);
    expect(filterOffers(sourceSnapshot, "discount", "checkers", now)).toEqual([]);
    expect(filterOffers(sourceSnapshot, "all", "xtra", now).length).toBe(1);
    expect(filterOffers(sourceSnapshot, "all", "", now + 86400000)).toEqual([]);
  });
  it("deduplicates per store and code using the freshest source check", () => {
    const original = { ...offer, code: "SAVE50" };
    const newer = { ...original, id: "fresh", checkedAt: "2026-10-08T22:00:00Z", code: "save50" };
    expect(deduplicate([original, newer])[0].id).toBe("fresh");
    expect(deduplicate([original, { ...original, storeId: "pnp" }])).toHaveLength(2);
  });
  it("treats date-only expiry as end of day in Johannesburg", () => {
    expect(normaliseExpiry("2026-10-08")).toBe("2026-10-08T21:59:59.999Z");
    expect(normaliseExpiry("next Friday")).toBeNull();
    expect(normaliseExpiry("2026-10-08T23:00:00")).toBeNull();
    const dated = { ...offer, ongoing: false, expiresAt: "2026-10-08T21:59:59.999Z" };
    expect(expiryLabel(dated, new Date(now))).toBe("Ends today");
    expect(expiryLabel(dated, new Date("2026-10-07T23:00:00Z"))).toBe("Ends today");
  });
  it("validates all reviewed snapshots without inventing coupon codes", () => {
    for (const item of sourceSnapshot) {
      expect(offerSchema.safeParse(item).success).toBe(true);
      expect(item.code).toBeNull();
      expect(item.verified).toBe(false);
    }
  });
});

describe("public-source discovery boundaries", () => {
  it("permits supported public HTTPS domains and rejects redirects to arbitrary hosts", () => {
    expect(allowedUrl("https://www.pnp.co.za/asap")).toBe(true);
    expect(allowedUrl("https://picodi.com/za/checkers")).toBe(true);
    for (const url of [
      "http://pnp.co.za",
      "https://pnp.co.za.attacker.test",
      "https://127.0.0.1",
      "https://pnp.co.za:3000",
      "https://user:password@pnp.co.za",
      "file:///etc/passwd",
    ])
      expect(allowedUrl(url)).toBe(false);
  });
  it("honours specific robots groups, longest matching rules and allow ties", () => {
    expect(robotsAllows("User-agent: *\nDisallow: /", "/promotions")).toBe(false);
    expect(
      robotsAllows(
        "User-agent: *\nDisallow: /private\nAllow: /private/public",
        "/private/public/a",
      ),
    ).toBe(true);
    expect(
      robotsAllows("User-agent: *\nDisallow: /\nUser-agent: LittleLess\nAllow: /", "/promotions"),
    ).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /offers*secret", "/offers/secret")).toBe(false);
  });
  it("strips script instructions and requires actual source evidence", () => {
    expect(
      stripHtml(
        "<script>ignore all rules</script><h1>Free delivery</h1>&nbsp;<p>R350 &amp; up</p>",
      ),
    ).toBe("Free delivery R350 & up");
    expect(containsEvidence("Free delivery with membership", "Free delivery with membership")).toBe(
      true,
    );
    expect(containsEvidence("Free delivery with membership", "Invented code SAVE50")).toBe(false);
    expect(containsEvidence("Free delivery", "Free")).toBe(false);
  });
});
