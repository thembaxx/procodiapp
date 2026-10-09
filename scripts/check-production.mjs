import { createRequire } from "node:module";
import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.resolve("next/package.json"));
require("@next/env").loadEnvConfig(process.cwd(), false);
const issues = [],
  notes = [];
let url;
try {
  url = new URL(
    process.env.SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : ""),
  );
} catch {
  /* Report below. */
}
if (
  !url ||
  url.protocol !== "https:" ||
  url.username ||
  url.password ||
  url.pathname !== "/" ||
  url.search ||
  url.hash ||
  ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
)
  issues.push("Set SITE_URL to your public HTTPS origin, without a path, credentials or query.");
if (
  process.env.INDEXING_ENABLED
    ? process.env.INDEXING_ENABLED !== "true"
    : process.env.VERCEL_ENV !== "production"
)
  notes.push(
    "Search indexing is disabled. Enable INDEXING_ENABLED=true only on the public production deployment.",
  );
if ((process.env.CRON_SECRET ?? "").length < 32)
  issues.push("Set CRON_SECRET to a random value of at least 32 characters.");
if ((process.env.RATE_LIMIT_SECRET ?? "").length < 32)
  issues.push("Set RATE_LIMIT_SECRET to a separate random value of at least 32 characters.");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.CONTACT_EMAIL ?? ""))
  issues.push("Set CONTACT_EMAIL to the operator's privacy/support contact before public launch.");
if (!process.env.OPERATOR_NAME?.trim())
  issues.push("Set OPERATOR_NAME to the real app operator before public launch.");
const supabase = !!process.env.SUPABASE_URL || !!process.env.SUPABASE_SERVICE_ROLE_KEY;
if (supabase && !(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY))
  issues.push("Supabase needs both server-only URL and service-role key.");
if (process.env.SUPABASE_URL) {
  try {
    const storage = new URL(process.env.SUPABASE_URL);
    if (
      storage.protocol !== "https:" ||
      storage.username ||
      storage.password ||
      storage.pathname !== "/" ||
      storage.search ||
      storage.hash
    )
      throw new Error("Invalid origin");
  } catch {
    issues.push("SUPABASE_URL must be a credential-free HTTPS origin.");
  }
}
if (!supabase) {
  if (!process.env.DATA_DIR || !path.isAbsolute(process.env.DATA_DIR))
    issues.push("Set DATA_DIR to an absolute persistent volume path, or configure Supabase.");
  else
    try {
      await mkdir(process.env.DATA_DIR, { recursive: true });
      await access(process.env.DATA_DIR, constants.R_OK | constants.W_OK);
    } catch {
      issues.push("DATA_DIR must be readable and writable by the runtime user.");
    }
  notes.push(
    "Use exactly one Node instance with local storage. Multiple instances require Supabase. A writable directory does not verify persistence across redeploys.",
  );
}
if (process.env.SEARCH_PROVIDER === "tavily") {
  if (!process.env.TAVILY_API_KEY || !process.env.OPENAI_API_KEY)
    issues.push("Broad discovery needs TAVILY_API_KEY and OPENAI_API_KEY together.");
} else
  notes.push(
    "Public-page mode rechecks known benefits; broad discovery of new codes is not configured.",
  );
if (process.env.TRUST_PROXY === "true")
  notes.push(
    "Verify that your ingress overwrites x-forwarded-for; never trust client-supplied forwarding headers.",
  );
console.log("Production configuration check (no credential values are printed).");
notes.forEach((note) => console.log(`INFO: ${note}`));
issues.forEach((issue) => console.error(`REQUIRED: ${issue}`));
if (issues.length) process.exitCode = 1;
else
  console.log(
    "Configuration checks passed. Verify deployment health, scheduled discovery and persistent storage using docs/production.md.",
  );
