import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { inspectSource } from "./scraper-health-policy.mjs";

const BASE = "https://coupon-scraper.mndebele-themba.workers.dev";
const deployment = process.argv.includes("--deployment-smoke");
const results = [];
const errors = [];
const warnings = [];
async function read(path) {
  const url = new URL(path, BASE);
  if (url.origin !== BASE) throw new Error("Origin mismatch");
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(path + ": HTTP " + response.status);
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(path + ": incorrect response type");
  }
  const content = await response.text();
  if (content.length > 400_000) throw new Error(path + ": oversized response");
  const value = JSON.parse(content);
  results.push({ path, status: response.status });
  return value;
}

try {
  const health = await read("/api/health");
  if (health.ok !== true) errors.push("Worker health response is not OK");
} catch (error) {
  errors.push("Worker health: " + error.message);
}

try {
  const result = await read("/api/source-health");
  if (!Array.isArray(result.sources)) throw new Error("Missing source health array");
  if (!result.sources.length) warnings.push("No source checks are recorded yet");
  for (const s of result.sources) {
    const diagnostic = inspectSource(s, { deployment });
    errors.push(...diagnostic.errors);
    warnings.push(...diagnostic.warnings);
  }
} catch (error) {
  errors.push("Source health: " + error.message);
}

try {
  const result = await read("/api/verified-offers");
  if (result.reviewedOnly !== true || !Array.isArray(result.offers)) {
    throw new Error("Unexpected reviewed-offer response");
  }
  for (const offer of result.offers) {
    const until = Date.parse(offer.valid_until);
    if (!Number.isFinite(until) || until <= Date.now()) {
      errors.push("Stale or invalid reviewed offer: " + String(offer.id).slice(0, 50));
    }
  }
} catch (error) {
  errors.push("Reviewed offers: " + error.message);
}

await mkdir("reports", { recursive: true });
const output = {
  checkedAt: new Date().toISOString(),
  base: BASE,
  mode: deployment ? "deployment" : "operational",
  results,
  errors,
  warnings,
};
await writeFile("reports/scraper-health.json", JSON.stringify(output, null, 2) + "\n");
const summary = [
  deployment ? "## Coupon scraper deployment smoke check" : "## Coupon scraper operational health",
  "",
  ...results.map((r) => "- " + r.path + ": HTTP " + r.status),
  "",
  "### Failures",
  ...(errors.length ? errors.map((s) => "- " + s) : ["- None"]),
  "",
  "### Review warnings",
  ...(warnings.length ? warnings.map((s) => "- " + s) : ["- None"]),
].join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
if (errors.length) process.exitCode = 1;
