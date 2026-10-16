import { describe, expect, it } from "vitest";
import { stores } from "../../src/lib/stores";
import {
  classifySearchResults,
  parseAggregatorLeads,
  searchLead,
} from "../../src/lib/server/search-discovery";

const pnp = stores.find((store) => store.id === "pnp")!;

describe("search-backed coupon discovery", () => {
  it("queues only approved official and coupon-aggregator pages", () => {
    const leads = classifySearchResults(pnp, [
      { title: "Official PnP offers", url: "https://www.pnp.co.za/asap" },
      { title: "Third party", url: "https://www.wethrift.com/codes/pnp.co.za" },
      { title: "Internal address", url: "http://localhost:3000/private" },
    ]);
    expect(leads.officialUrls).toEqual(["https://www.pnp.co.za/asap"]);
    expect(leads.aggregatorUrls).toEqual(["https://www.wethrift.com/codes/pnp.co.za"]);
    expect(leads.candidates).toEqual([]);
  });

  it("never saves web-search snippets as coupon evidence", () => {
    const result = classifySearchResults(pnp, [
      {
        title: "Voucher code SAVE15",
        description: "From web search",
        url: "https://unknown.example/coupon",
      },
    ]);
    expect(result.candidates).toEqual([]);
  });

  it("marks independently read coupon-site claims as unverified", () => {
    const document = {
      url: "https://www.wethrift.com/codes/pnp.co.za",
      html: "<article><h3>Pick n Pay discount</h3><p>Use code SAVE15 for grocery delivery</p></article>",
      text: "Pick n Pay discount Use code SAVE15 for grocery delivery",
    };
    const candidates = parseAggregatorLeads(pnp, document);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].code).toBe("SAVE15");
    expect(candidates[0].reason).toBe("unverified_third_party");
  });

  it("does not allow unrelated or unsafe sources", () => {
    expect(searchLead(pnp, { title: "PNP rewards", url: "https://example.com/a" })).toBeNull();
    expect(searchLead(pnp, { title: "Use code SAVE15", url: "file:///etc/passwd" })).toBeNull();
    expect(
      parseAggregatorLeads(pnp, {
        url: "https://unapproved.example/pnp",
        text: "Use code SAVE15",
        html: "<article>Use code SAVE15</article>",
      }),
    ).toEqual([]);
  });
});
