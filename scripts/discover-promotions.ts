import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.resolve("next/package.json"));
require("@next/env").loadEnvConfig(process.cwd(), false);

async function main() {
  const publish = process.argv.includes("--publish");
  if (
    publish &&
    (process.env.PROMOTION_FEED === "github" || process.env.SUPABASE_URL || !process.env.DATA_DIR)
  )
    throw new Error("Feed publishing needs a local output directory.");
  if (process.env.GITHUB_ACTIONS && !publish && !process.env.SUPABASE_URL)
    throw new Error("An Actions runner must publish its feed or use shared storage.");
  if (process.env.SUPABASE_URL && (process.env.RATE_LIMIT_SECRET ?? "").length < 32)
    throw new Error("Scheduled discovery needs the app's strong rate-limit secret.");
  const { cleanupExpiredData } = await import("../src/lib/server/storage");
  const { requireDiscovery, discoverOffers, discoveryCandidates } =
    await import("../src/lib/server/discovery");
  const { DiscoveryBusyError, hasCompletedDiscovery, refreshPromotions } =
    await import("../src/lib/server/promotion-refresh");
  // Report retention still runs if search configuration or providers fail.
  await cleanupExpiredData();
  requireDiscovery();
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      const data = publish
        ? { ...(await discoverOffers()), reused: false }
        : await refreshPromotions();
      if (!hasCompletedDiscovery(data)) throw new Error("No source check completed.");
      if (publish) {
        await mkdir(process.env.DATA_DIR!, { recursive: true });
        await writeFile(
          path.join(process.env.DATA_DIR!, "candidates.json"),
          JSON.stringify(discoveryCandidates(), null, 2),
        );
      }
      const { tregUsage } = await import("../src/lib/server/treg-client");
      const usage = tregUsage();
      if (usage.calls)
        console.log(
          `Treg used ${usage.calls} calls; charged or conservatively reserved $ ${(usage.chargedMicro / 1_000_000).toFixed(6)}. Review the Treg ledger for final settlement.`,
        );
      const checked = data.checks.filter((check) => check.status === "checked").length;
      console.log(
        `${data.reused ? "Loaded recent scan" : publish ? "Prepared public feed" : "Updated shared promotions"}: ${data.offers.length} active offers, ${data.newOfferIds.length} new, ${checked}/${data.checks.length} stores checked.`,
      );
      if (checked < data.checks.length || data.checks.some((check) => check.message))
        console.warn(
          "Some stores were unavailable; fresh previous listings retain their original deadlines.",
        );
      return;
    } catch (error) {
      if (!(error instanceof DiscoveryBusyError) || Date.now() >= deadline) throw error;
      // Give an active browser scan time to finish, then read its shared result.
      await new Promise((resolve) => setTimeout(resolve, Math.min(error.retryAfter * 1000, 5000)));
    }
  }
}

try {
  await main();
} catch {
  console.error(
    "Promotion discovery failed. Check public-source availability, storage/output configuration and any optional CJ fallback settings. Existing fresh data retains its original deadline; no credentials or source contents are logged.",
  );
  process.exitCode = 1;
}
