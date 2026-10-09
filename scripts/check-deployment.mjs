// Read-only smoke check. Never include bodies, credentials or provider data in logs.
export function assertDeploymentResponse(route, status, contentType, body) {
  if (status < 200 || status >= 300)
    throw new Error(`Deployment readiness failed at ${route}: HTTP ${status}`);
  if (route === "/api/health" && JSON.parse(body).status !== "ready")
    throw new Error("Storage readiness check did not confirm health.");
  if (route === "/api/offers" && !Array.isArray(JSON.parse(body).offers))
    throw new Error("Offers endpoint did not return its expected public shape.");
  if (route === "/sw.js" && !/javascript/.test(contentType ?? ""))
    throw new Error("Service worker is not served as JavaScript.");
  if (["/", "/stores", "/privacy"].includes(route) && !/little\s+less/i.test(body))
    throw new Error(`Expected application content missing at ${route}.`);
}

if (import.meta.main) {
  try {
    const base = new URL(process.env.DEPLOYMENT_URL ?? "");
    if (
      base.protocol !== "https:" ||
      base.username ||
      base.password ||
      base.pathname !== "/" ||
      base.search ||
      base.hash
    )
      throw new Error("DEPLOYMENT_URL must be a public HTTPS origin.");
    const headers = {};
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET)
      headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    for (const route of ["/api/health", "/api/offers", "/", "/stores", "/privacy", "/sw.js"]) {
      const response = await fetch(new URL(route, base), {
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(`Deployment readiness failed at ${route}: HTTP ${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error(`Missing response body at ${route}.`);
      const chunks = [];
      let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 2 * 1024 * 1024) throw new Error(`Response limit exceeded at ${route}.`);
          chunks.push(Buffer.from(value));
        }
      } finally {
        void reader.cancel().catch(() => {});
      }
      assertDeploymentResponse(
        route,
        response.status,
        response.headers.get("content-type"),
        Buffer.concat(chunks).toString("utf8"),
      );
      console.log(`PASS ${route}`);
    }
  } catch (error) {
    // Raw fetch/URL errors can include configuration: log only controlled messages.
    console.error(
      error instanceof Error &&
        /^(Deployment|Storage|Offers|Service|Expected|Missing|Response)/.test(error.message)
        ? error.message
        : "Deployment smoke check failed: verify origin, connectivity and response validity.",
    );
    process.exitCode = 1;
  }
}
