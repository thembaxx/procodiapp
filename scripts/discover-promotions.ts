import { createRequire } from "node:module";

const require = createRequire(import.meta.resolve("next/package.json"));
require("@next/env").loadEnvConfig(process.cwd(), false);

async function main() {
  // A temporary Actions filesystem cannot be the app's shared promotion store.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Scheduled discovery needs shared Supabase storage.");
  if ((process.env.RATE_LIMIT_SECRET ?? "").length < 32)
    throw new Error("Scheduled discovery needs the app's strong rate-limit secret.");
  const { cleanupExpiredData } = await import("../src/lib/server/storage");
  const { requireWebDiscovery } = await import("../src/lib/server/discovery");
  const { DiscoveryBusyError, hasWebDiscovery, refreshPromotions } =
    await import("../src/lib/server/promotion-refresh");
  // Report retention still runs if search configuration or providers fail.
  await cleanupExpiredData();
  requireWebDiscovery();
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      const data = await refreshPromotions();
      if (!hasWebDiscovery(data)) throw new Error("No web discovery completed.");
      const checked = data.checks.filter(
        (check) => check.searched && (check.extractedPages ?? 0) > 0,
      ).length;
      console.log(
        `${data.reused ? "Loaded recent scan" : "Updated shared promotions"}: ${data.offers.length} active offers, ${data.newOfferIds.length} new, ${checked}/${data.checks.length} stores checked.`,
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
    "Promotion discovery failed. Check shared storage, RATE_LIMIT_SECRET, SEARCH_PROVIDER=tavily, TAVILY_API_KEY and OPENAI_API_KEY. Existing fresh data remains available; no credentials or source contents are logged.",
  );
  process.exitCode = 1;
}
