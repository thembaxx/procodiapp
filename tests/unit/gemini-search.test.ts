import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchGeminiPromotions } from "../../src/lib/server/gemini-search";
import { searchPromotions } from "../../src/lib/server/search-discovery";
import { resetTregUsage } from "../../src/lib/server/treg-client";
import { stores } from "../../src/lib/stores";
import { discoverGeminiPageLinks } from "../../src/lib/server/gemini-page-discovery";

vi.mock("../../src/lib/server/gemini-page-discovery", () => ({
  discoverGeminiPageLinks: vi.fn(),
}));

const signal = new AbortController().signal;
const rows = [{ storeId: "pnp", title: "Coupon terms", url: "https://www.pnp.co.za/terms" }];
function grounded(text = JSON.stringify({ results: rows })) {
  return {
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text }] },
        groundingMetadata: {
          webSearchQueries: ["Pick n Pay grocery delivery coupon South Africa"],
          groundingChunks: [{ web: { uri: rows[0].url, title: "Terms" } }],
        },
      },
    ],
  };
}

beforeEach(() => {
  vi.mocked(discoverGeminiPageLinks).mockReset().mockResolvedValue({ searched: false, rows: [] });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubEnv("GEMINI_API_KEY", "gemini-test-only-key");
  vi.stubEnv("DISCOVERY_SEARCH_MODE", "brave");
  vi.stubEnv("BRAVE_SEARCH_API_KEY", "");
  vi.stubEnv("TREG_TOKEN", "");
  resetTregUsage();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Gemini primary promotion search", () => {
  it("batches all retailers into one bounded grounded request without putting the key in a URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(grounded()));
    vi.stubGlobal("fetch", fetchMock);
    const result = await searchGeminiPromotions(signal);
    expect(result).toEqual({ searched: true, rows });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    expect(options.headers["x-goog-api-key"]).toBe("gemini-test-only-key");
    expect(options).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const request = JSON.parse(options.body);
    expect(request.tools).toEqual([{ google_search: {} }]);
    for (const store of stores) expect(request.contents[0].parts[0].text).toContain(store.name);
    expect(JSON.stringify(result)).not.toContain("gemini-test-only-key");
  });

  it("accepts JSON fences and ignores internal thinking text", async () => {
    const response = grounded("```json\n" + JSON.stringify({ results: rows }) + "\n```");
    response.candidates[0].content.parts.unshift({ text: "Internal reasoning" });
    Object.assign(response.candidates[0].content.parts[0], { thought: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(response)));
    expect((await searchGeminiPromotions(signal)).rows).toEqual(rows);
  });

  it("uses Flash-Lite only when Google lists it as an available free-tier-compatible alternative", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: { status: "NOT_FOUND" } }, { status: 404 }))
      .mockResolvedValueOnce(
        Response.json({
          models: [
            {
              name: "models/gemini-2.5-flash-lite",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json(grounded()));
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchGeminiPromotions(signal)).toEqual({ searched: true, rows });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&fields=models(name,supportedGenerationMethods)",
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
    );
    expect(fetchMock.mock.calls[2][1].body).toBe(fetchMock.mock.calls[0][1].body);
  });

  it("does not switch to models without documented free-tier search grounding", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: { status: "NOT_FOUND" } }, { status: 404 }))
      .mockResolvedValueOnce(
        Response.json({
          models: [
            {
              name: "models/gemini-3.8-flash",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchGeminiPromotions(signal)).toMatchObject({ searched: false, rows: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(discoverGeminiPageLinks).toHaveBeenCalledExactlyOnceWith("gemini-test-only-key", signal);
  });

  it("does not call a provider without a key or when search is disabled for user refresh", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GEMINI_API_KEY", "  ");
    expect(await searchGeminiPromotions(signal)).toEqual({ searched: false, rows: [] });
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-only-key");
    vi.stubEnv("DISCOVERY_SEARCH_MODE", "none");
    expect(await searchGeminiPromotions(signal)).toEqual({ searched: false, rows: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 500])(
    "falls back without retries or provider-body leaks on HTTP %i",
    async (status) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response("gemini-test-only-key", { status }));
      vi.stubGlobal("fetch", fetchMock);
      const result = await searchGeminiPromotions(signal);
      expect(result).toMatchObject({ searched: false, rows: [], warning: expect.any(String) });
      if (status === 429) expect(result.warning).toContain("quota");
      expect(JSON.stringify(result)).not.toContain("gemini-test-only-key");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(discoverGeminiPageLinks).not.toHaveBeenCalled();
      expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
        "gemini-test-only-key",
      );
    },
  );

  it("logs only fixed HTTP/error codes, never arbitrary provider error details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              status: "INVALID_ARGUMENT",
              message: "Secret gemini-test-only-key",
              details: [{ reason: "API_KEY_INVALID" }, { reason: "gemini-test-only-key" }],
            },
          },
          { status: 400 },
        ),
      ),
    );
    await searchGeminiPromotions(signal);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      "Gemini web search failed: HTTP 400 (INVALID_ARGUMENT, API_KEY_INVALID).",
    );
  });

  it.each(["ungrounded", "truncated", "malformed", "oversized"])(
    "discards %s output instead of treating it as a completed search",
    async (kind) => {
      const response = grounded();
      if (kind === "ungrounded") response.candidates[0].groundingMetadata.webSearchQueries = [];
      if (kind === "truncated") response.candidates[0].finishReason = "MAX_TOKENS";
      if (kind === "malformed") response.candidates[0].content.parts[0].text = "not JSON";
      if (kind === "oversized") response.candidates[0].content.parts[0].text = "x".repeat(150_001);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(response)));
      expect(await searchGeminiPromotions(signal)).toMatchObject({
        searched: false,
        rows: [],
        warning: expect.any(String),
      });
    },
  );

  it("does not issue a request after cancellation and sanitizes network failures", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("gemini-test-only-key"));
    vi.stubGlobal("fetch", fetchMock);
    await searchGeminiPromotions(AbortSignal.abort());
    expect(fetchMock).not.toHaveBeenCalled();
    const result = await searchGeminiPromotions(signal);
    expect(result).toMatchObject({ searched: false, rows: [], warning: expect.any(String) });
    expect(JSON.stringify(result)).not.toContain("gemini-test-only-key");
  });

  it("uses Gemini official URLs before configured legacy providers and never persists model claims", async () => {
    vi.stubEnv("DISCOVERY_SEARCH_MODE", "both");
    vi.stubEnv("TREG_TOKEN", "treg-test-only-key");
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "brave-test-only-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await searchPromotions(stores[1], signal, {
      searched: true,
      rows: [
        { storeId: "pnp", title: "Invented use code FAKE99", url: rows[0].url },
        { storeId: "pnp", title: "Unsafe", url: "https://127.0.0.1/private" },
        { storeId: "pnp", title: "Other store", url: "https://www.makro.co.za/terms" },
        { storeId: "makro", title: "Wrong retailer ID", url: "https://www.pnp.co.za/other" },
      ],
    });
    expect(result.officialUrls).toEqual([rows[0].url]);
    expect(result.candidates).toEqual([]);
    expect(result.searched).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tries the configured legacy search when Gemini finds no permitted official URL", async () => {
    vi.stubEnv("DISCOVERY_SEARCH_MODE", "treg");
    vi.stubEnv("TREG_TOKEN", "treg-test-only-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ output: { results: [{ title: "Terms", url: rows[0].url }] } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await searchPromotions(stores[1], signal, {
      searched: false,
      rows: [],
      warning: "Gemini free-tier quota was reached; using other sources.",
    });
    expect(result.officialUrls).toEqual([rows[0].url]);
    expect(result.warning).toContain("Gemini");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://treg.to/call/treg.web.search");
  });
});
