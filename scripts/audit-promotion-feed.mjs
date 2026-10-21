import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { auditPromotionFeed } from "../src/lib/server/promotion-feed-audit";

const feedUrl = "https://raw.githubusercontent.com/thembaxx/procodiapp/promotion-data/offers.json";
let report = {
  checkedAt: new Date().toISOString(),
  result: "fail",
  errors: [],
  warnings: [],
  offers: 0,
  checkedSources: 0,
};

try {
  const response = await fetch(feedUrl, {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Published feed HTTP " + response.status);
  const raw = await response.text();
  if (raw.length > 2_000_000) throw new Error("Published feed exceeds safe size");
  report = auditPromotionFeed(JSON.parse(raw));
} catch (error) {
  report.errors.push(String(error?.message || error));
}

mkdirSync(resolve("feed-health"), { recursive: true });
writeFileSync(resolve("feed-health/report.json"), JSON.stringify(report, null, 2) + "\n");
const summary = [
  "## Source-listed promotion feed audit",
  "",
  "| Signal | Value |",
  "| --- | --- |",
  "| Result | " + report.result + " |",
  "| Age | " + (report.ageHours ?? "unknown") + " hours |",
  "| Offers | " + report.offers + " |",
  "| Checked sources | " + report.checkedSources + " |",
  "| Source listed (not checkout-tested) | " + (report.sourceListed ?? 0) + " |",
  "| Checkout tested | " + (report.checkoutTested ?? 0) + " |",
  "",
  "Errors: " + (report.errors.join("; ") || "None"),
  "Warnings: " + (report.warnings.join("; ") || "None"),
].join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
}
if (report.result !== "pass") process.exitCode = 1;
