import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  callTreg,
  resetTregUsage,
  tregExtractedText,
  tregSearchRows,
  tregUsage,
} from "../src/lib/server/treg-client";
import { extractedCouponLeads } from "../src/lib/server/treg-review-leads";
import { stores } from "../src/lib/stores";
import { classifySearchResults } from "../src/lib/server/search-discovery";

const originalEnv = { ...process.env };
const signal = new AbortController().signal;

describe("Treg integration", () => {
  beforeEach(() => {
    resetTregUsage();
    process.env.TREG_TOKEN = "test-token";
    process.env.TREG_MAX_COST_USD = "0.01";
    process.env.TREG_SCAN_BUDGET_USD = "0.02";
    process.env.TREG_MAX_CALLS_PER_SCAN = "2";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("uses the routed API with credentials, a fixed cost ceiling and measured charge", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ output: { results: [{ title: "Store", url: "https://www.pnp.co.za/asap" }] } }),
        { status: 200, headers: { "X-Treg-Cost-Micro": "700" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const output = await callTreg("treg.web.search", { query: "Pick n Pay coupon South Africa" }, signal);
    expect(tregSearchRows(output)).toHaveLength(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://treg.to/call/treg.web.search");
    expect(options.headers["X-Treg-Token"]).toBe("test-token");
    expect(options.headers["X-Treg-Route-Max-Cost"]).toBe("0.01");
    expect(options.redirect).toBe("error");
    expect(tregUsage()).toEqual({ calls: 1, chargedMicro: 700, reservedMicro: 0 });
  });

  it("does not issue calls once the scan reservation limit is exhausted", async () => {
    process.env.TREG_SCAN_BUDGET_USD = "0.01";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ output: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await callTreg("treg.web.search", { query: "test" }, signal);
    await expect(callTreg("treg.web.search", { query: "test again" }, signal))
      .rejects.toThrow("budget");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not treat an asynchronous pending job as a completed source", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ _treg: { outcome: "pending" } }), { status: 202 },
    )));
    await expect(callTreg("treg.web.extract", { url: "https://www.pnp.co.za/asap" }, signal))
      .rejects.toThrow("pending");
  });

  it("accepts normalized search fields while retailer allowlists reject unrelated sites", () => {
    const rows = tregSearchRows({
      results: [
        { name: "PnP promotion", link: "https://www.pnp.co.za/asap", snippet: "Groceries" },
        { title: "Other country", url: "https://bad.example/offers" },
      ],
    });
    expect(rows).toHaveLength(2);
    const classified = classifySearchResults(stores[1], rows);
    expect(classified.officialUrls).toEqual(["https://www.pnp.co.za/asap"]);
    expect(classified.aggregatorUrls).toEqual([]);
    expect(classified.candidates).toEqual([]);
  });

  it("quarantines extracted coupon codes as candidates rather than publishable offers", () => {
    const text = "This is a promotion at Pick n Pay online: use code SAVE50 for eligible grocery orders, " +
      "subject to store terms, exclusions and a minimum basket. ".repeat(3);
    const extracted = tregExtractedText({ markdown: text });
    expect(extracted).not.toBeNull();
    const result = extractedCouponLeads(stores[1], "https://www.pnp.co.za/asap", extracted!);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("SAVE50");
    expect(result[0].reason).toBe("unverified_third_party");
    expect(extractedCouponLeads(stores[1], "https://evil.example/offers", extracted!))
      .toEqual([]);
  });
});
