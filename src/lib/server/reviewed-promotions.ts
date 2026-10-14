import { z } from "zod";
import reviewed from "../../../data/reviewed-promotions.json";
import { sourceSnapshot } from "../snapshot";
import type { Offer } from "../offers";
import type { Store } from "../stores";
import {
  containsEvidence,
  DAY,
  evaluatePromotion,
  expiryFromText,
  publishedDate,
} from "./promotion-parser";
import type { PublicDocument } from "./public-pages";

const reviewedSchema = z
  .array(
    z.object({
      storeId: z.enum(["checkers", "pnp", "woolworths", "shoprite", "spar", "makro"]),
      sourceUrl: z.url().max(2000),
      code: z.string().min(2).max(64).nullable(),
      title: z.string().min(5).max(160),
      criteriaEvidence: z.string().min(10).max(650),
      expiresAt: z.string().max(40),
      expiryEvidence: z.string().min(10).max(800),
      codeEvidence: z.string().min(10).max(800).nullable(),
    }),
  )
  .max(100);
export const reviewedPromotions = reviewedSchema.parse(reviewed);

const requirements: Record<string, RegExp[]> = {
  "checkers-xtra-plus-delivery": [/Xtra Savings Plus/i, /R\s*99(?:\.00)?\b/, /R\s*350(?:\.00)?\b/],
  "woolworths-plus-delivery": [/MyDifference\s*PLUS/i, /Woolies Card/i, /free delivery/i],
  "makro-senior-food": [
    /60(?:\s*\(sixty\))?\s*(?:years|\+)/i,
    /online|Website/i,
    /marketplace|third party/i,
    /liquor/i,
    /baby formula/i,
  ],
};

export function checkReviewedPromotions(
  store: Store,
  document: PublicDocument,
  now = Date.now(),
): Offer[] {
  const offers: Offer[] = [];
  for (const known of sourceSnapshot.filter(
    (offer) => offer.storeId === store.id && offer.sourceUrl === document.url,
  )) {
    if (
      containsEvidence(document.text, known.evidence) &&
      (requirements[known.id] ?? []).every((pattern) => pattern.test(document.text))
    )
      offers.push({
        ...known,
        collectionMethod: "reviewed_source",
        checkedAt: new Date(now).toISOString(),
        validUntil: new Date(now + DAY).toISOString(),
      });
  }
  for (const record of reviewedPromotions.filter(
    (item) => item.storeId === store.id && item.sourceUrl === document.url,
  )) {
    if (
      !containsEvidence(document.text, record.criteriaEvidence) ||
      !containsEvidence(document.text, record.expiryEvidence)
    )
      continue;
    if (
      record.code &&
      (!record.codeEvidence ||
        !record.codeEvidence.includes(record.code) ||
        !containsEvidence(document.text, record.codeEvidence))
    )
      continue;
    if (expiryFromText(record.expiryEvidence) !== publishedDate(record.expiresAt)) continue;
    const parsed = evaluatePromotion(
      store,
      document.url,
      {
        code: record.code,
        title: record.title,
        text: `${record.criteriaEvidence} ${record.codeEvidence ?? ""} ${record.expiryEvidence}`.trim(),
        expiresAt: record.expiresAt,
      },
      now,
    );
    offers.push(
      ...parsed.offers.map((offer) => ({ ...offer, collectionMethod: "reviewed_source" as const })),
    );
  }
  return offers;
}
