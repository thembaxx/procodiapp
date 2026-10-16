import { describe, expect, it } from "vitest";
import { stores } from "../stores";
import { classifySearchResults, searchLead } from "./search-discovery";

const pnp = stores.find((store) => store.id === "pnp")!;

describe("search discovery", () => {
  it("queues official retailer pages and approved aggregators only", () => {
    const leads = classifySearchResults(pnp, [
      { title: "Official PnP offers", url: "https://www.pnp.co.za/asap" },
      { title: "Third party", url: "https://www.wethrift.com/codes/pnp.co.za" },
      { title: "Internal address", url: "http://localhost:3000/private" },
    ]);
    expect(leads.officialUrls).toEqual(["https://www.pnp.co.za/asap"]);
    expect(leads.aggregatorUrls).toEqual(["https://www.wethrift.com/codes/pnp.co.za"]);
  });

  it("stores general-web snippets as unverified leads, not live offers", () => {
    const lead = searchLead(pnp, {
      title: "Pick n Pay voucher code SAVE15",
      url: "https://example.com/pnp-vouchers",
      description: "Unverified listing from another site",
    });
    expect(lead?.code).toBe("SAVE15");
    expect(lead?.reason).toBe("unverified_third_party");
    expect(lead?.sourceUrl).toBe("https://example.com/pnp-vouchers");
  });

  it("ignores snippets without codes and unsafe schemes", () => {
    expect(searchLead(pnp, { title: "PNP rewards", url: "https://example.com/a" })).toBeNull();
    expect(searchLead(pnp, { title: "Use code SAVE15", url: "file:///etc/passwd" })).toBeNull();
  });
});
