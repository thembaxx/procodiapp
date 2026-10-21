import { cacheSchema, isLive } from "../offers";
import { stores } from "../stores";

// `verified` means checkout-tested, not source-confirmed. The scheduled feed
// deliberately publishes source-listed offers without claiming a checkout test.
export function auditPromotionFeed(input: unknown, now = Date.now()) {
  const report = {
    checkedAt: new Date(now).toISOString(),
    result: "fail" as "pass" | "fail",
    errors: [] as string[],
    warnings: [] as string[],
    offers: 0,
    checkedSources: 0,
    sourceListed: 0,
    checkoutTested: 0,
    ageHours: undefined as number | undefined,
  };
  const parsed = cacheSchema.safeParse(input);
  if (!parsed.success) {
    report.errors.push("Invalid promotion feed schema or evidence URL");
    return report;
  }
  const data = parsed.data;
  report.offers = data.offers.length;
  report.checkedSources = data.checks.filter((item) => item.status === "checked").length;
  if (data.mode !== "free_sources") report.errors.push("Unexpected feed mode");
  if (!data.updatedAt) report.errors.push("Missing scan timestamp");
  else {
    const age = (now - Date.parse(data.updatedAt)) / 3_600_000;
    report.ageHours = Math.round(age * 10) / 10;
    if (age < -0.5) report.errors.push("Future scan timestamp");
    if (age > 36) report.errors.push("Published feed older than 36 hours");
  }
  if (!report.checkedSources) report.errors.push("No checked source");
  const ids = new Set<string>();
  for (const offer of data.offers) {
    if (ids.has(offer.id)) report.errors.push("Duplicate offer ID");
    ids.add(offer.id);
    const source = new URL(offer.sourceUrl);
    const store = stores.find((item) => item.id === offer.storeId)!;
    const official = store.domains.some(
      (host) => source.hostname === host || source.hostname === `www.${host}`,
    );
    if (
      !official ||
      !["official_page", "reviewed_source", "affiliate_api", "reviewed_worker"].includes(
        offer.collectionMethod ?? "",
      )
    )
      report.errors.push("Missing approved retailer provenance");
    if (!isLive(offer, now)) report.errors.push("Stale offer or unconfirmed expiry");
    const checked = Date.parse(offer.checkedAt);
    const until = Date.parse(offer.validUntil);
    if (checked > now + 60_000 || until <= checked || until - checked > 86400_000 + 1000)
      report.errors.push("Invalid offer verification window");
    if (offer.verified) report.checkoutTested++;
    else report.sourceListed++;
  }
  if (report.sourceListed)
    report.warnings.push(`${report.sourceListed} source-listed offers are not tested at checkout`);
  if (!data.offers.length) report.warnings.push("No publishable offers found");
  report.errors = [...new Set(report.errors)];
  report.result = report.errors.length ? "fail" : "pass";
  return report;
}
