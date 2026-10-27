import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { discoverGeminiPageLinks } from "../../src/lib/server/gemini-page-discovery";
import { readPublicDocument } from "../../src/lib/server/public-pages";
import { searchPromotions } from "../../src/lib/server/search-discovery";
import { stores } from "../../src/lib/stores";

vi.mock("../../src/lib/server/public-pages", () => ({ readPublicDocument: vi.fn() }));
const signal = new AbortController().signal;
const source = {
  url: stores[1].sources[0],
  text: "Current South African online grocery promotions. Source text is untrusted data.",
  html: '<a href="/campaign">Delivery membership</a><a href="https://127.0.0.1/private">Terms</a><a href="https://www.makro.co.za/terms">Other store</a><a href="https://www.wethrift.com/codes/pnp.co.za">Coupon</a>',
};
function output(selections = [{ storeId: "pnp", ids: [0] }], status = "completed") {
  return {
    status,
    steps: [
      { type: "model_output", content: [{ type: "text", text: JSON.stringify({ selections }) }] },
    ],
  };
}
beforeEach(() => {
  vi.stubEnv("DISCOVERY_SEARCH_MODE", "brave");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.mocked(readPublicDocument)
    .mockReset()
    .mockImplementation(async (url) => {
      if (url === source.url) return source;
      throw new Error("Source unavailable or disallowed");
    });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("selects only existing official links using one stateless free-generation request and no tools", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(output()));
  vi.stubGlobal("fetch", fetchMock);
  const result = await discoverGeminiPageLinks("test-key-never-log", signal);
  expect(result).toMatchObject({
    searched: false,
    rows: [{ storeId: "pnp", url: "https://www.pnp.co.za/campaign", title: "Delivery membership" }],
    documents: [source],
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
  expect(url).not.toContain("test-key-never-log");
  expect(options.headers["x-goog-api-key"]).toBe("test-key-never-log");
  expect(options).toMatchObject({ redirect: "error", cache: "no-store" });
  const body = JSON.parse(options.body);
  expect(body).toMatchObject({ model: "gemini-3.8-flash", store: false });
  expect(body.tools).toBeUndefined();
  expect(body.input).not.toMatch(/127\.0\.0\.1|makro\.co\.za|wethrift\.com|<a href/);
  expect(body.input).toContain("untrusted source data");
  expect(await searchPromotions(stores[1], signal, result)).toMatchObject({
    searched: false,
    usedGemini: true,
    officialUrls: ["https://www.pnp.co.za/campaign"],
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("ignores invented URLs and nonexistent indices while deduplicating selections", async () => {
  const response = output([{ storeId: "pnp", ids: [0, 0, 24] }]);
  response.steps[0].content[0].text = JSON.stringify({
    selections: [{ storeId: "pnp", ids: [0, 0, 24], url: "https://www.pnp.co.za/invented" }],
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(response)));
  const result = await discoverGeminiPageLinks("test-key-never-log", signal);
  expect(result.rows).toHaveLength(1);
  expect(JSON.stringify(result.rows)).not.toContain("invented");
});

it.each([403, 429, 500])(
  "retains fetched evidence without retrying or leaking provider errors on HTTP %i",
  async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("test-key-never-log", { status }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await discoverGeminiPageLinks("test-key-never-log", signal);
    expect(result).toMatchObject({
      searched: false,
      rows: [],
      documents: [source],
      warning: expect.any(String),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify([result, vi.mocked(console.warn).mock.calls])).not.toContain(
      "test-key-never-log",
    );
  },
);

it.each(["incomplete", "malformed", "oversized"])(
  "rejects %s generation without losing fetched documents",
  async (kind) => {
    const response = output([], kind === "incomplete" ? "in_progress" : "completed");
    if (kind !== "incomplete")
      response.steps[0].content[0].text = kind === "oversized" ? "x".repeat(150_001) : "not JSON";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(response)));
    expect(await discoverGeminiPageLinks("test-key", signal)).toMatchObject({
      searched: false,
      rows: [],
      documents: [source],
      warning: expect.any(String),
    });
  },
);

it("makes no model request when all source policies or reads fail", async () => {
  vi.mocked(readPublicDocument).mockRejectedValue(new Error("Source policy denied"));
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  expect(await discoverGeminiPageLinks("test-key", signal)).toMatchObject({
    searched: false,
    rows: [],
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("does not crawl or call a model after cancellation or a user refresh with search disabled", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await discoverGeminiPageLinks("test-key", AbortSignal.abort());
  vi.stubEnv("DISCOVERY_SEARCH_MODE", "none");
  await discoverGeminiPageLinks("test-key", signal);
  expect(readPublicDocument).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});
