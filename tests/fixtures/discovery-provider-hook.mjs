import { writeFile } from "node:fs/promises";
const retailers = [
  ["Checkers Sixty60", "sixty60.co.za"],
  ["Pick n Pay asap!", "pnp.co.za"],
  ["Woolworths Dash", "woolworths.co.za"],
  ["Shoprite", "shoprite.co.za"],
  ["SPAR2U", "spar.co.za"],
  ["Makro", "makro.co.za"],
];
const text =
  "<article><h2>Worker fixture grocery promotion</h2><p>South African online groceries: save R40 using code WORKER40. Minimum spend R400. Expires on 2099-12-31. Delivery exclusions and checkout eligibility apply.</p></article>";
const githubRequests = [];
globalThis.fetch = async (target, options = {}) => {
  const url = String(target);
  if (url.startsWith("https://api.github.com/repos/test/publisher/git/")) {
    if (options.headers?.Authorization !== "Bearer publisher-test-only-token")
      throw new Error("Unexpected publication authentication.");
    const record = {
      url,
      method: options.method,
      body: options.body ? JSON.parse(options.body) : null,
    };
    githubRequests.push(record);
    await writeFile(process.env.DISCOVERY_GITHUB_OUTPUT, JSON.stringify(githubRequests));
    if (url.endsWith("git/ref/heads/promotion-data"))
      return new Response("Missing", { status: 404 });
    return Response.json({ sha: String(githubRequests.length).padStart(40, "0") });
  }
  if (url.startsWith("https://storage.example.invalid/rest/v1/")) {
    if (url.includes("rpc/cleanup_expired_data")) return Response.json(0);
    if (url.includes("rpc/take_refresh_slot")) return Response.json(0);
    if (options.method === "POST" && url.includes("promotion_cache")) {
      await writeFile(
        process.env.DISCOVERY_TEST_OUTPUT,
        JSON.stringify({ record: JSON.parse(options.body) }),
      );
      return new Response(null, { status: 204 });
    }
    return Response.json([]);
  }
  if (url.endsWith("/robots.txt"))
    return new Response("User-agent: *\nAllow: /", { headers: { "Content-Type": "text/plain" } });
  if (
    retailers.some(
      ([, host]) => new URL(url).hostname === host || new URL(url).hostname === `www.${host}`,
    )
  )
    return new Response(text, { headers: { "Content-Type": "text/html" } });
  if (url.includes("wethrift.com")) return new Response("Unavailable", { status: 503 });
  throw new Error("Fixture blocked an unexpected network request.");
};
