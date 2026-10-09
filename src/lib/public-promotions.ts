import { filterOffers, type Offer } from "./offers";
import { stores } from "./stores";
import { siteConfig } from "./site";

function text(value: string) {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/[\\`*_{}[\]<>#|]/g, (character) => `\\${character}`);
}
export function promotionsMarkdown(offers: Offer[], now = Date.now()) {
  const live = filterOffers(offers, "all", "", now);
  const { origin } = siteConfig();
  const link = (path: string) => (origin ? `${origin}${path}` : path);
  return [
    "# Grocery Codes SA: current grocery promotions",
    "",
    `Generated: ${new Date(now).toISOString()}. Time zone: Africa/Johannesburg (UTC+2).`,
    "",
    "Independent South African online grocery listings. Source listed does not mean tested at checkout. Confirm eligibility, fees and delivery channel with the retailer. Never infer a coupon code from a no-code benefit.",
    "",
    "Only fresh, unexpired offers with known expiry or an explicitly recurring benefit appear here. Every record expires from this feed at its review-valid-until timestamp or published expiry, whichever comes first. Fetch this document again before recommending a deal; do not preserve a claim past that deadline.",
    "",
    ...stores.flatMap((store) => {
      const current = live.filter((offer) => offer.storeId === store.id);
      return [
        `## ${store.name}`,
        "",
        `Store details: ${link(`/stores/${store.id}`)}`,
        "",
        ...(current.length
          ? current.flatMap((offer) => [
              `### ${text(offer.title)}`,
              `- Type: ${offer.type === "free_delivery" ? "Free delivery" : "Discount"}`,
              `- Code: ${offer.code ? text(offer.code) : "No code needed"}`,
              `- Qualifying criteria: ${text(offer.criteria)}`,
              `- Published expiry: ${offer.expiresAt ?? "Ongoing recurring benefit; no end date listed"}`,
              `- Last reviewed: ${offer.checkedAt}`,
              `- Review valid until: ${offer.validUntil}`,
              `- Checkout status: ${offer.verified ? "Tested at checkout" : "Not tested at checkout"}`,
              `- Source: ${offer.sourceUrl}`,
              "",
            ])
          : [
              "No fresh confirmed promotion. This does not mean the retailer has no other offers.",
              "",
            ]),
      ];
    }),
    `Source policy: ${link("/about")}`,
    `Privacy: ${link("/privacy")}`,
    "",
  ].join("\n");
}
