import type { Offer } from "./offers";

// Reviewed primary-source benefits, not prototype coupon codes. This snapshot
// expires after 24 hours and must be confirmed by discovery to remain visible.
const reviewedAt = "2026-10-08T20:30:00.000Z";
const base = {
  code: null,
  expiresAt: null,
  expiryKnown: true,
  ongoing: true,
  foundAt: reviewedAt,
  checkedAt: reviewedAt,
  validUntil: "2026-10-09T20:30:00.000Z",
  verified: false,
} as const;

export const sourceSnapshot: Offer[] = [
  {
    ...base,
    id: "checkers-xtra-plus-delivery",
    storeId: "checkers",
    type: "free_delivery",
    title: "Unlimited deliveries. A little less to spend.",
    criteria:
      "Xtra Savings Plus subscription required (R99/month). Sixty60 grocery basket of R350 or more. Link your Xtra Savings profile in the app; eligible delivery areas only.",
    minBasketZar: 350,
    sourceName: "Xtra Savings Plus terms",
    sourceUrl: "https://www.termsconditions.co.za/docs/Xtra-Savings-Plus.pdf",
    evidence: "free deliveries on Sixty60 service as many times as they wish",
  },
  {
    ...base,
    id: "woolworths-plus-delivery",
    storeId: "woolworths",
    type: "free_delivery",
    title: "Free online delivery with MyDifference PLUS",
    criteria:
      "For eligible Woolies Card customers in MyDifference PLUS. Online delivery benefit is subject to programme terms, exclusions and delivery area. Dash eligibility is not confirmed; check before ordering.",
    sourceName: "Woolworths",
    sourceUrl: "https://www.woolworths.co.za/content/look/mydifference-plus-joinplus/_/A-cmp216901",
    evidence: "Get free delivery when you shop Woolies online",
  },
  {
    ...base,
    id: "makro-senior-food",
    storeId: "makro",
    type: "discount",
    title: "Up to 5% off selected food for seniors",
    criteria:
      "Age 60+ with a valid Makro mSenior Citizens Card and South African ID or passport. Log in with your registered mSenior Citizens profile. Selected food only; excludes promotions, marketplace sellers, liquor, tobacco, baby formula and delivery fees. Applies automatically at checkout; personal purchases only.",
    sourceName: "Makro terms of use",
    sourceUrl: "https://www.makro.co.za/pages/terms-of-use",
    evidence: "a discount of up to 5% (five percent) applies to selected food items",
  },
];
