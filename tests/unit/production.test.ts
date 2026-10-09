import { afterEach, describe, expect, it, vi } from "vitest";
import { siteConfig, jsonLd, pageMetadata } from "../../src/lib/site";
import { promotionsMarkdown } from "../../src/lib/public-promotions";
import { sourceSnapshot } from "../../src/lib/snapshot";
import { offerSchema } from "../../src/lib/offers";
import { sameOrigin, reportBody, clientBucket } from "../../src/lib/server/request-guards";
import { allowedStoreUrl } from "../../src/lib/server/public-pages";
import { stores } from "../../src/lib/stores";
import { takeRefreshSlot, checkStorage } from "../../src/lib/server/storage";

const now = Date.parse("2026-10-08T21:00:00Z");
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("production discovery metadata", () => {
  it("keeps previews unindexed and refuses invalid canonical origins", () => {
    expect(siteConfig({})).toMatchObject({ origin: null, indexable: false });
    for (const origin of [
      "http://grocery.example",
      "https://user:secret@grocery.example",
      "https://grocery.example/sub",
      "https://grocery.example/?secret=yes",
      "https://localhost",
      "https://127.0.0.1",
      "invalid",
    ])
      expect(siteConfig({ SITE_URL: origin, INDEXING_ENABLED: "true" }).indexable).toBe(false);
    expect(
      siteConfig({ SITE_URL: "https://grocery.example/", INDEXING_ENABLED: "true" }),
    ).toMatchObject({ origin: "https://grocery.example", indexable: true });
    expect(siteConfig({ SITE_URL: "https://grocery.example" }).indexable).toBe(false);
  });
  it("uses Vercel's stable production domain while keeping previews unindexed", () => {
    expect(
      siteConfig({ VERCEL_PROJECT_PRODUCTION_URL: "grocery.example", VERCEL_ENV: "production" }),
    ).toMatchObject({ origin: "https://grocery.example", indexable: true });
    expect(
      siteConfig({
        VERCEL_PROJECT_PRODUCTION_URL: "grocery.example",
        VERCEL_ENV: "preview",
        VERCEL_URL: "untrusted-preview.example",
      }),
    ).toMatchObject({ origin: "https://grocery.example", indexable: false });
    expect(
      siteConfig({
        SITE_URL: "https://custom.example",
        VERCEL_PROJECT_PRODUCTION_URL: "grocery.example",
        VERCEL_ENV: "production",
        INDEXING_ENABLED: "false",
      }),
    ).toMatchObject({ origin: "https://custom.example", indexable: false });
    expect(
      siteConfig({ VERCEL_URL: "untrusted-preview.example", VERCEL_ENV: "production" }),
    ).toMatchObject({ origin: null, indexable: false });
  });
  it("uses the configured canonical rather than an incoming host or filter query", () => {
    vi.stubEnv("SITE_URL", "https://grocery.example");
    vi.stubEnv("INDEXING_ENABLED", "true");
    expect(pageMetadata("Store", "Description", "/stores/checkers").alternates?.canonical).toBe(
      "https://grocery.example/stores/checkers",
    );
  });
  it("escapes source content that could close a structured-data script", () => {
    const malicious = { title: "</script><script>alert('x')</script>&\u2028" };
    const serialized = jsonLd(malicious);
    expect(serialized).not.toContain("<");
    expect(serialized).not.toContain("&");
    expect(JSON.parse(serialized)).toEqual(malicious);
  });
  it("keeps expired, stale and unsupported-expiry offers out of AI text", () => {
    const base = sourceSnapshot[0];
    const live = { ...base, title: "Live grocery offer" };
    const dead = [
      { ...base, title: "Expired grocery offer", expiresAt: new Date(now).toISOString() },
      { ...base, title: "Stale grocery offer", validUntil: new Date(now).toISOString() },
      { ...base, title: "Unknown grocery offer", expiryKnown: false },
    ];
    const markdown = promotionsMarkdown([live, ...dead], now);
    expect(markdown).toContain(live.title);
    expect(markdown).toContain(live.criteria);
    expect(markdown).toContain(live.validUntil);
    expect(markdown).toContain("Not tested at checkout");
    for (const offer of dead) expect(markdown).not.toContain(offer.title);
    expect(markdown).not.toContain("undefined");
  });
  it("rejects executable source URLs and retailer mismatches", () => {
    expect(
      offerSchema.safeParse({ ...sourceSnapshot[0], sourceUrl: "javascript:alert(1)" }).success,
    ).toBe(false);
    expect(allowedStoreUrl("https://pnp.co.za/asap", stores[0])).toBe(false);
    expect(allowedStoreUrl("https://checkers.co.za/offers", stores[0])).toBe(true);
    expect(allowedStoreUrl("https://wethrift.com/checkers", stores[0])).toBe(true);
  });
});

describe("API request boundaries", () => {
  it("accepts the canonical origin behind ingress and rejects cross-site browser requests", () => {
    vi.stubEnv("SITE_URL", "https://grocery.example");
    const request = (headers: HeadersInit) =>
      new Request("http://internal:3000/api/report", { headers });
    expect(sameOrigin(request({ origin: "https://grocery.example" }))).toBe(true);
    expect(sameOrigin(request({ origin: "https://attacker.example" }))).toBe(false);
    expect(sameOrigin(request({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(sameOrigin(request({}))).toBe(true);
    vi.stubEnv("TRUST_PROXY", "false");
    expect(clientBucket(request({ "x-forwarded-for": "attacker" }))).toBe("local");
  });
  it("bounds chunked report bytes even without Content-Length", async () => {
    const request = new Request("https://grocery.example/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '"' + "x".repeat(2500) + '"',
    });
    expect(request.headers.has("content-length")).toBe(false);
    await expect(reportBody(request)).rejects.toMatchObject({ status: 413 });
  });
  it("distinguishes malformed JSON from storage or provider failures", async () => {
    await expect(
      reportBody(
        new Request("https://grocery.example", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      reportBody(new Request("https://grocery.example", { method: "POST", body: "{}" })),
    ).rejects.toMatchObject({ status: 415 });
    expect(
      await reportBody(
        new Request("https://grocery.example", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: '{"reason":"The offer has ended"}',
        }),
      ),
    ).toEqual({ reason: "The offer has ended" });
  });
  it("fails closed when distributed limiter responses are invalid", async () => {
    vi.stubEnv("SUPABASE_URL", "https://storage.example");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-key");
    vi.stubEnv("RATE_LIMIT_SECRET", "unit-test-only-rate-limit-secret-value");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json("not a duration")),
    );
    await expect(takeRefreshSlot("unit-test")).rejects.toThrow("invalid response");
  });
  it("reports unavailable readiness for incomplete persistence configuration", async () => {
    vi.stubEnv("SUPABASE_URL", "https://storage.example");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(await checkStorage()).toBe(false);
  });
});
