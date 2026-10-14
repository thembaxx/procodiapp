import { afterEach, expect, it, vi } from "vitest";
import { stores } from "../../src/lib/stores";
import { collectCjFallback, parseCjResponse } from "../../src/lib/server/cj-fallback";
import { discoverOffers } from "../../src/lib/server/discovery";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const fields = {
  "advertiser-id": "12345",
  "relationship-status": "joined",
  "targeted-countries": "ZA",
  destination: "https://www.pnp.co.za/terms/grocery-discount",
  "coupon-code": "CJ50",
  "link-name": "R50 online grocery saving",
  description:
    "South African online groceries; save R50. Minimum spend R500. Delivery exclusions apply.",
  "promotion-end-date": "2099-12-31T20:00:00",
  "promotion-start-date": "2000-01-01T00:00:00",
};
function xml(overrides: Partial<typeof fields> = {}, total = 1) {
  return `<cj-api><links total-matched="${total}" records-returned="1" page-number="1"><link>${Object.entries(
    { ...fields, ...overrides },
  )
    .map(([key, value]) => `<${key}>${value}</${key}>`)
    .join("")}</link></links></cj-api>`;
}
function configure() {
  vi.stubEnv("CJ_API_TOKEN", "unit-test-only-cj-token");
  vi.stubEnv("CJ_WEBSITE_ID", "45678");
  vi.stubEnv("CJ_ADVERTISERS", '{"pnp":["12345"]}');
}
it("accepts a joined ZA retailer and interprets CJ timestamps as UTC", () => {
  const parsed = parseCjResponse(xml(), stores[1], ["12345"]);
  expect(parsed.offers[0]).toMatchObject({
    code: "CJ50",
    expiresAt: "2099-12-31T20:00:00.000Z",
    collectionMethod: "affiliate_api",
    sourceName: "CJ Affiliate",
    minBasketZar: 500,
  });
});
it("rejects wrong merchants, foreign targeting, unjoined programmes, redirects and missing expiry", () => {
  for (const override of [
    { "advertiser-id": "999" },
    { "relationship-status": "notjoined" },
    { "targeted-countries": "AU" },
    { destination: "https://tracker.example/click" },
    { destination: "https://www.makro.co.za/terms" },
    { "promotion-end-date": "2000-01-01T00:00:00" },
    { "promotion-start-date": "2099-01-01T00:00:00" },
  ])
    expect(parseCjResponse(xml(override), stores[1], ["12345"]).offers).toEqual([]);
  const missing = parseCjResponse(xml({ "promotion-end-date": "ongoing" }), stores[1], ["12345"]);
  expect(missing.offers).toEqual([]);
  expect(missing.candidates[0]?.reason).toBe("missing_expiry");
  expect(() =>
    parseCjResponse(
      '<!DOCTYPE cj-api [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + xml(),
      stores[1],
      ["12345"],
    ),
  ).toThrow("Unsupported");
  expect(() =>
    parseCjResponse(xml().replace('records-returned="1"', 'records-returned="2"'), stores[1], [
      "12345",
    ]),
  ).toThrow("pagination");
});
it("bounds requests and sends credentials only to the fixed CJ endpoint", async () => {
  configure();
  const fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const target = new URL(String(url));
    expect(target.origin).toBe("https://link-search.api.cj.com");
    expect(target.searchParams.get("targeted-country")).toBe("ZA");
    expect(target.searchParams.get("advertiser-ids")).toBe("12345");
    expect(init).toMatchObject({ redirect: "error", cache: "no-store" });
    expect(init?.headers).toMatchObject({ Authorization: "Bearer unit-test-only-cj-token" });
    return new Response(xml(), { headers: { "Content-Type": "application/xml" } });
  });
  vi.stubGlobal("fetch", fetch);
  expect((await collectCjFallback(stores[1], AbortSignal.timeout(1000)))?.offers[0]?.code).toBe(
    "CJ50",
  );
  expect(fetch).toHaveBeenCalledOnce();
  expect(await collectCjFallback(stores[0], AbortSignal.timeout(1000))).toBeNull();
});
it("uses the real fallback orchestration after the official source fails", async () => {
  configure();
  const directory = await mkdtemp(path.join(os.tmpdir(), "littleless-cj-fallback-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("PROMOTION_FEED", "local");
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const target = String(url);
      calls.push(target);
      return target.startsWith("https://link-search.api.cj.com/")
        ? new Response(xml(), { headers: { "Content-Type": "application/xml" } })
        : new Response("Unavailable", { status: 503 });
    }),
  );
  try {
    const result = await discoverOffers();
    expect(result.offers.map((offer) => offer.code)).toEqual(["CJ50"]);
    expect(result.checks.find((check) => check.storeId === "pnp")).toMatchObject({
      status: "checked",
      pages: 0,
      fallback: "checked",
      fallbackOffers: 1,
    });
    expect(calls.findIndex((url) => url.includes("pnp.co.za"))).toBeLessThan(
      calls.findIndex((url) => url.startsWith("https://link-search.api.cj.com/")),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
