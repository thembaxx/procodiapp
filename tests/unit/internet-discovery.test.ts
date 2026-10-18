import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  discoverOffers,
  discoveryUrls,
  requireDiscovery,
  discoveryCandidates,
} from "../../src/lib/server/discovery";
import { readCache, writeCache } from "../../src/lib/server/storage";
import { sourceSnapshot } from "../../src/lib/snapshot";
import { stores } from "../../src/lib/stores";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "littleless-free-discovery-"));
  for (const [name, value] of Object.entries({
    DATA_DIR: directory,
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    CJ_API_TOKEN: "",
    CJ_WEBSITE_ID: "",
    CJ_ADVERTISERS: "",
    GEMINI_API_KEY: "",
    BRAVE_SEARCH_API_KEY: "",
    TREG_TOKEN: "",
    DISCOVERY_SEARCH_MODE: "brave",
    PROMOTION_FEED: "local",
  }))
    vi.stubEnv(name, value);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});

function oldOffer() {
  return {
    ...sourceSnapshot[0],
    id: "old-test-voucher",
    code: "OLD50",
    ongoing: false,
    sourceUrl: "https://www.sixty60.co.za/old-promotion",
    collectionMethod: "official_page" as const,
    expiresAt: "2099-12-31T21:59:59.999Z",
    checkedAt: new Date(Date.now() - 60_000).toISOString(),
    validUntil: new Date(Date.now() + 60_000).toISOString(),
  };
}
async function previous() {
  const offer = oldOffer();
  await writeCache({
    offers: [offer],
    updatedAt: offer.checkedAt,
    checks: [],
    mode: "free_sources",
  });
  return offer;
}
function mockSources(
  options: { empty?: boolean; failedOldPage?: boolean; allFailed?: boolean } = {},
) {
  const fetchMock = vi.fn(async (value: string | URL | Request, init?: RequestInit) => {
    const url = String(value);
    expect(url).not.toMatch(/api\.openai\.com|api\.tavily\.com/);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    if (options.allFailed || (options.failedOldPage && url.endsWith("/old-promotion")))
      return new Response("Unavailable", { status: 503 });
    if (url.endsWith("/robots.txt"))
      return new Response("User-agent: *\nAllow: /", { headers: { "Content-Type": "text/plain" } });
    if (url.includes("wethrift.com")) return new Response("Unavailable", { status: 503 });
    const content = options.empty
      ? "This public information page currently has no qualifying online grocery promotions. Please check the official retailer terms before ordering."
      : "<article><h2>Online grocery discount</h2><p>South African online groceries: save R50 using code WEB50. Minimum spend R500. Expires on 2099-12-31. Delivery areas and exclusions apply.</p></article>";
    return new Response(content, { headers: { "Content-Type": "text/html" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

it("collects all retailers and persists evidenced codes without search or model credentials", async () => {
  mockSources();
  const result = await discoverOffers();
  expect(result.mode).toBe("free_sources");
  expect(result.offers).toHaveLength(6);
  expect(result.offers.every((offer) => offer.code === "WEB50" && !offer.verified)).toBe(true);
  expect(result.newOfferIds).toHaveLength(6);
  expect(result.checks.every((check) => (check.parsedPages ?? 0) > 0 && !check.searched)).toBe(
    true,
  );
  expect(result.checks.every((check) => check.fallback === "not_needed")).toBe(true);
  expect((await readCache()).offers).toEqual(result.offers);
  expect(discoveryCandidates()).toEqual([]);
});
it("shares one Gemini search across all stores and independently fetches its official sources", async () => {
  vi.stubEnv("GEMINI_API_KEY", "gemini-test-only-key");
  const fetchMock = mockSources();
  const rows = stores.map((store) => ({
    storeId: store.id,
    title: "Use code INVENTED99",
    url: `${store.url}/gemini-campaign`,
  }));
  fetchMock.mockImplementationOnce(async () =>
    Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify({ results: rows }) }] },
          groundingMetadata: {
            webSearchQueries: ["South African grocery promotions"],
            groundingChunks: [{ web: { uri: rows[0].url } }],
          },
        },
      ],
    }),
  );
  const result = await discoverOffers();
  const requests = fetchMock.mock.calls.map(([url]) => String(url));
  expect(requests.filter((url) => url.includes("generativelanguage.googleapis.com"))).toHaveLength(
    1,
  );
  for (const row of rows) expect(requests).toContain(row.url);
  expect(result.checks.every((check) => check.searched && check.status === "checked")).toBe(true);
  expect(result.offers).toHaveLength(6);
  expect(result.offers.every((offer) => offer.code === "WEB50")).toBe(true);
  expect(discoveryCandidates()).toEqual([]);
  expect(JSON.stringify(await readCache())).not.toMatch(/INVENTED99|gemini-test-only-key/);
});
it("removes a previous code after its successful source evaluation no longer confirms it", async () => {
  await previous();
  mockSources({ empty: true });
  expect((await discoverOffers()).offers).toEqual([]);
});
it("keeps still-fresh previous data on source failure without extending its deadline", async () => {
  const offer = await previous();
  mockSources({ empty: true, failedOldPage: true });
  expect((await discoverOffers()).offers).toEqual([offer]);
});
it("does not advance the successful scan timestamp on total source failure, even after a Gemini search", async () => {
  const offer = await previous();
  vi.stubEnv("GEMINI_API_KEY", "gemini-test-only-key");
  const fetchMock = mockSources({ allFailed: true });
  fetchMock.mockImplementationOnce(async () =>
    Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify({ results: [] }) }] },
          groundingMetadata: {
            webSearchQueries: ["South African grocery promotions"],
            groundingChunks: [{ web: { uri: stores[0].url } }],
          },
        },
      ],
    }),
  );
  const result = await discoverOffers();
  expect(result.updatedAt).toBe(offer.checkedAt);
  expect(result.offers).toEqual([offer]);
  expect(result.checks.every((check) => check.status === "unavailable")).toBe(true);
  expect(result.checks.every((check) => check.searched)).toBe(true);
});
it("does not resurrect stale data on source failure", async () => {
  const offer = oldOffer();
  offer.validUntil = new Date(Date.now() - 1).toISOString();
  await writeCache({
    offers: [offer],
    updatedAt: offer.checkedAt,
    checks: [],
    mode: "free_sources",
  });
  mockSources({ allFailed: true });
  expect((await discoverOffers()).offers).toEqual([]);
});
it("balances reviewed sources, current codes and official pages within a fixed budget", () => {
  const urls = discoveryUrls(
    stores[0],
    ["https://www.sixty60.co.za/new", "https://www.sixty60.co.za/new-two"],
    [oldOffer()],
  );
  expect(urls).toContain(oldOffer().sourceUrl);
  expect(urls).toContain(stores[0].sources[0]);
  expect(urls).toHaveLength(5);
});
it("permits credential-free primary collection but rejects partial fallback configuration", () => {
  expect(() => requireDiscovery()).not.toThrow();
  vi.stubEnv("CJ_API_TOKEN", "test-only-token");
  expect(() => requireDiscovery()).toThrow("CJ fallback needs");
});
