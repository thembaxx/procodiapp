import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const feedUrl = "https://raw.githubusercontent.com/thembaxx/procodiapp/promotion-data/offers.json";
const report = {
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
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.offers) || !Array.isArray(data.checks)) {
    throw new Error("Unexpected feed shape");
  }
  report.offers = data.offers.length;
  report.checkedSources = data.checks.filter((item) => item.status === "checked").length;
  if (!data.updatedAt || !Number.isFinite(Date.parse(data.updatedAt))) {
    report.errors.push("Missing scan timestamp");
  } else {
    const ageHours = (Date.now() - Date.parse(data.updatedAt)) / 3_600_000;
    report.ageHours = Math.round(ageHours * 10) / 10;
    if (ageHours < -0.5) report.errors.push("Future scan timestamp");
    if (ageHours > 36) report.errors.push("Published feed older than 36 hours");
  }
  if (!report.checkedSources) report.errors.push("No checked source");
  const ids = new Set();
  for (const item of data.offers) {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id)) {
      report.errors.push("Missing or duplicate offer ID");
    } else {
      ids.add(item.id);
    }
    if (!item?.verified) report.errors.push("Unverified offer");
    if (!item?.expiryKnown) report.errors.push("Unconfirmed offer expiry");
    if (typeof item?.sourceUrl !== "string" || !item.sourceUrl.startsWith("https://")) {
      report.errors.push("Missing HTTPS evidence URL");
    }
    if (!Number.isFinite(Date.parse(item?.validUntil))) {
      report.errors.push("Missing validUntil");
    }
  }
  if (!data.offers.length) report.warnings.push("No publishable offers found");
  report.errors = [...new Set(report.errors)];
  report.result = report.errors.length ? "fail" : "pass";
} catch (error) {
  report.errors.push(String(error?.message || error));
}

mkdirSync(resolve("feed-health"), { recursive: true });
writeFileSync(resolve("feed-health/report.json"), JSON.stringify(report, null, 2) + "\n");
const summary = [
  "## Verified promotion feed audit",
  "",
  "| Signal | Value |",
  "| --- | --- |",
  "| Result | " + report.result + " |",
  "| Age | " + (report.ageHours ?? "unknown") + " hours |",
  "| Offers | " + report.offers + " |",
  "| Checked sources | " + report.checkedSources + " |",
  "",
  "Errors: " + (report.errors.join("; ") || "None"),
  "Warnings: " + (report.warnings.join("; ") || "None"),
].join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
}
if (report.result !== "pass") process.exitCode = 1;
