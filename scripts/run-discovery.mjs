// Scheduler credentials only go to a validated HTTPS origin, never a redirect.
let url;
try {
  url = new URL(process.env.APP_URL ?? "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error("Invalid origin");
  if ((process.env.CRON_SECRET ?? "").length < 32) throw new Error("Weak secret");
} catch {
  console.error("Discovery needs a valid HTTPS APP_URL origin and a strong CRON_SECRET.");
  process.exit(1);
}
try {
  const response = await fetch(new URL("/api/cron", url), {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    redirect: "error",
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Scheduled discovery returned HTTP ${response.status}.`);
  // Avoid writing whole responses/source contents or request credentials to CI logs.
  console.log("Scheduled discovery completed successfully.");
} catch {
  console.error(
    "Scheduled discovery failed; check readiness, scheduler configuration and source availability.",
  );
  process.exitCode = 1;
}
