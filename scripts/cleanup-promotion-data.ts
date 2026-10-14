import { cleanupExpiredData } from "../src/lib/server/storage";

try {
  const url = !!process.env.SUPABASE_URL,
    key = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url !== key) throw new Error("Incomplete private storage configuration.");
  if (url && key) {
    await cleanupExpiredData();
    console.log("Cleaned up eligible private reports and expired limiter records.");
  } else
    console.log(
      "No shared private report storage configured; local retention runs on report writes.",
    );
} catch {
  console.error(
    "Private storage cleanup failed. Check shared storage configuration; no credentials are logged.",
  );
  process.exitCode = 1;
}
