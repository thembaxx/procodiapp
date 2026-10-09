import type { StoreId } from "./stores";

export const storeContent: Record<StoreId, { intro: string; tips: string[] }> = {
  checkers: {
    intro:
      "Explore source-listed Checkers Sixty60 grocery promotions and Xtra Savings benefits. Subscription delivery benefits and one-off coupon codes have different requirements.",
    tips: [
      "Check whether an offer requires Xtra Savings or a paid Xtra Savings Plus subscription.",
      "Confirm the qualifying basket amount, eligible deliveries and subscription fee in the retailer's terms.",
      "Check Sixty60 availability for your delivery address before ordering.",
    ],
  },
  pnp: {
    intro:
      "Find confirmed Pick n Pay asap! grocery promotions and Smart Shopper offers when current public evidence is available. Personalised app offers may differ from publicly listed deals.",
    tips: [
      "Confirm whether Smart Shopper membership or linking your account is required.",
      "Check whether the promotion applies to asap! delivery or another Pick n Pay shopping channel.",
      "Read minimum spend, first-order and geographic restrictions before using a code.",
    ],
  },
  woolworths: {
    intro:
      "Compare source-listed Woolworths grocery benefits, including MyDifference membership offers. Woolworths online delivery and Dash are separate channels; a benefit for one does not confirm eligibility for the other.",
    tips: [
      "Read the stated delivery channel: online store, Dash or both.",
      "Check whether MyDifference PLUS membership and a qualifying basket are required.",
      "Confirm delivery coverage, membership fees and exclusions on the official source page.",
    ],
  },
  shoprite: {
    intro:
      "Check public Shoprite grocery promotions and Xtra Savings information. Many retailer promotions are in-store offers; this app only lists offers with evidence supporting online grocery eligibility.",
    tips: [
      "Check that the terms explicitly cover your online shopping channel.",
      "Confirm Xtra Savings membership requirements and participating locations.",
      "An in-store special does not automatically qualify as an online coupon.",
    ],
  },
  spar: {
    intro:
      "Explore current source-listed SPAR2U grocery promotions and SPAR Rewards information. Participating stores, delivery coverage and local terms can affect availability.",
    tips: [
      "Confirm that your local SPAR participates in SPAR2U delivery.",
      "Read store-specific conditions and delivery-area restrictions.",
      "Check whether SPAR Rewards registration or a minimum basket is required.",
    ],
  },
  makro: {
    intro:
      "Read confirmed Makro online grocery discounts and delivery promotions. Makro sells many non-food products; only qualifying grocery benefits appear in these listings.",
    tips: [
      "Check grocery category exclusions and whether the benefit is available online.",
      "Read age, account or Makro Card eligibility requirements where applicable.",
      "Confirm whether delivery fees, marketplace sellers or selected products are excluded.",
    ],
  },
};
