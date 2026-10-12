import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoverOffers, discoveryUrls, requireWebDiscovery } from "../../src/lib/server/discovery";
import { readCache, writeCache } from "../../src/lib/server/storage";
import { sourceSnapshot } from "../../src/lib/snapshot";
import { stores } from "../../src/lib/stores";
import { allowedStoreUrl } from "../../src/lib/source-urls";
import { normaliseExpiry } from "../../src/lib/offers";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const source =
  "South African online groceries: save R50 using WEB50 on baskets of R500. The promotion ends on 2099-12-31. Delivery areas and product exclusions apply. OLD50 ended on 2000-01-01. Monthly membership benefits continue for subscribers.";
const extracted = {
  code: "WEB50",
  type: "discount",
  title: "Test-only online grocery saving",
  criteria:
    "South African online groceries only; minimum basket R500; delivery areas and exclusions apply.",
  expiresAt: "2099-12-31",
  ongoing: false,
  evidence: "South African online groceries: save R50 using WEB50 on baskets of R500.",
  expiryEvidence: "The promotion ends on 2099-12-31.",
  codeEvidence: "save R50 using WEB50 on baskets of R500.",
  minBasketZar: 500,
  newCustomersOnly: false,
};

function oldOffer() {
  return {
    ...sourceSnapshot[0],
    id: "old-test-voucher",
    code: "OLD50",
    ongoing: false,
    sourceUrl: "https://www.sixty60.co.za/old-promotion",
    expiresAt: "2099-12-31T21:59:59.999Z",
    checkedAt: new Date(Date.now() - 60_000).toISOString(),
    validUntil: new Date(Date.now() + 60_000).toISOString(),
  };
}

async function fixture(task: () => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "littleless-web-discovery-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.stubEnv("SEARCH_PROVIDER", "tavily");
  vi.stubEnv("TAVILY_API_KEY", "test-only-search");
  vi.stubEnv("OPENAI_API_KEY", "test-only-extraction");
  try {
    await task();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function mockProviders(
  options: { empty?: boolean; failedOldPage?: boolean; allFailed?: boolean } = {},
) {
  const searched = new Set<string>();
  const fetchMock = vi.fn(async (value: string | URL | Request, init?: RequestInit) => {
    const url = String(value);
    if (options.allFailed) return new Response("Unavailable", { status: 503 });
    if (url === "https://api.tavily.com/search") {
      const body = JSON.parse(String(init?.body));
      const store = stores.find((item) => body.query.includes(item.name))!;
      searched.add(store.id);
      expect(body.query).toContain("South Africa grocery coupon");
      expect(body.include_domains).toContain(store.domains[0]);
      return Response.json({
        results: options.empty
          ? []
          : [
              { url: `https://www.${store.domains[0]}/latest-promotion` },
              { url: "https://www.wethrift.com/unrelated-merchant" },
            ],
      });
    }
    if (url === "https://api.openai.com/v1/chat/completions") {
      const body = JSON.parse(String(init?.body));
      const page = JSON.parse(body.messages[1].content).sourceUrl as string;
      if (options.failedOldPage && page.endsWith("/old-promotion"))
        return new Response("Unavailable", { status: 503 });
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                offers: page.endsWith("/latest-promotion")
                  ? [
                      extracted,
                      {
                        ...extracted,
                        code: "OLD50",
                        expiresAt: "2000-01-01",
                        expiryEvidence: "OLD50 ended on 2000-01-01.",
                        codeEvidence: "OLD50 ended on 2000-01-01.",
                      },
                      {
                        ...extracted,
                        expiresAt: null,
                        ongoing: true,
                        expiryEvidence: "Monthly membership benefits continue for subscribers.",
                      },
                      { ...extracted, expiresAt: "2099-02-30" },
                      {
                        ...extracted,
                        code: "INVENTED",
                        codeEvidence: "This code is not actually on the source.",
                      },
                    ]
                  : [],
              }),
            },
          },
        ],
      });
    }
    if (url.endsWith("/robots.txt"))
      return new Response("User-agent: *\nAllow: /", { headers: { "Content-Type": "text/plain" } });
    return new Response(source, { headers: { "Content-Type": "text/html" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { searched, fetchMock };
}

it("searches every retailer, persists new evidenced codes and rejects expired or unsupported codes", async () => {
  await fixture(async () => {
    const { searched, fetchMock } = mockProviders();
    const result = await discoverOffers();
    expect([...searched].sort()).toEqual(stores.map((store) => store.id).sort());
    expect(result.offers).toHaveLength(6);
    expect(result.offers.every((offer) => offer.code === "WEB50" && !offer.verified)).toBe(true);
    expect(result.newOfferIds).toHaveLength(6);
    expect(result.checks.every((check) => check.searched && check.extractedPages! > 0)).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("unrelated-merchant"))).toBe(
      false,
    );
    expect((await readCache()).offers).toEqual(result.offers);
    expect(result.updatedAt).not.toBeNull();
  });
});

it("removes a previously listed code when its checked source no longer confirms a current offer", async () => {
  await fixture(async () => {
    const offer = oldOffer();
    await writeCache({
      offers: [offer],
      updatedAt: offer.checkedAt,
      checks: [],
      mode: "web_search",
    });
    mockProviders({ empty: true });
    const result = await discoverOffers();
    expect(result.offers).toEqual([]);
    expect(result.checks.some((check) => check.extractedPages! > 0)).toBe(true);
    expect((await readCache()).offers).toEqual([]);
  });
});

it("keeps a still-fresh previous code on extraction failure without extending its deadline", async () => {
  await fixture(async () => {
    const offer = oldOffer();
    await writeCache({
      offers: [offer],
      updatedAt: offer.checkedAt,
      checks: [],
      mode: "web_search",
    });
    mockProviders({ empty: true, failedOldPage: true });
    const result = await discoverOffers();
    expect(result.offers).toEqual([offer]);
    expect(result.checks.find((check) => check.storeId === offer.storeId)?.message).toBeTruthy();
  });
});

it("does not advance the successful scan timestamp when every source and provider fails", async () => {
  await fixture(async () => {
    const offer = oldOffer();
    await writeCache({
      offers: [offer],
      updatedAt: offer.checkedAt,
      checks: [],
      mode: "web_search",
    });
    mockProviders({ allFailed: true });
    const result = await discoverOffers();
    expect(result.updatedAt).toBe(offer.checkedAt);
    expect(result.offers).toEqual([offer]);
    expect(result.checks.every((check) => !check.searched && check.pages === 0)).toBe(true);
  });
});

it("keeps newly checked offers when a full cache needs to stay within its storage bound", async () => {
  await fixture(async () => {
    const previous = Array.from({ length: 500 }, (_, index) => ({
      ...oldOffer(),
      id: `older-${index}`,
      code: `OLDER${index}`,
      sourceUrl: `https://www.sixty60.co.za/previous-${index}`,
    }));
    await writeCache({
      offers: previous,
      updatedAt: previous[0].checkedAt,
      checks: [],
      mode: "web_search",
    });
    mockProviders();
    const result = await discoverOffers();
    expect(result.offers).toHaveLength(500);
    expect(result.offers.filter((offer) => offer.code === "WEB50")).toHaveLength(6);
    expect(result.newOfferIds).toHaveLength(6);
    expect((await readCache()).offers).toHaveLength(500);
  });
});

it("balances search discoveries, current codes and official pages within the page budget", () => {
  const store = stores[0];
  const urls = discoveryUrls(
    store,
    ["https://www.sixty60.co.za/new", "https://www.sixty60.co.za/new-two"],
    [oldOffer()],
  );
  expect(urls).toContain("https://www.sixty60.co.za/new");
  expect(urls).toContain(oldOffer().sourceUrl);
  expect(urls).toContain(store.sources[0]);
  expect(urls).toHaveLength(5);
});

it("requires working search and extraction configuration for real web discovery", () => {
  vi.stubEnv("SEARCH_PROVIDER", "none");
  vi.stubEnv("TAVILY_API_KEY", "");
  vi.stubEnv("OPENAI_API_KEY", "");
  expect(() => requireWebDiscovery()).toThrow();
});

it("rejects another merchant, foreign Picodi pages and impossible calendar dates", () => {
  expect(allowedStoreUrl("https://wethrift.com/amazon", stores[0])).toBe(false);
  expect(allowedStoreUrl("https://picodi.com/us/checkers", stores[0])).toBe(false);
  expect(allowedStoreUrl("https://picodi.com/za/checkers", stores[0])).toBe(true);
  expect(normaliseExpiry("2099-02-30")).toBeNull();
  expect(normaliseExpiry("2099-02-30T23:00:00+02:00")).toBeNull();
});
