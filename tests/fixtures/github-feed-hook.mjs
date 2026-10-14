import { readFile } from "node:fs/promises";

const originalFetch = globalThis.fetch;
globalThis.fetch = async (value, options) => {
  const url = String(value);
  if (url === "https://raw.githubusercontent.com/test/browser-feed/promotion-data/offers.json") {
    if (options?.headers?.Authorization) throw new Error("Unexpected feed credentials.");
    return new Response(await readFile(process.env.DISCOVERY_FEED_FILE, "utf8"), {
      headers: { "Content-Type": "application/json" },
    });
  }
  if (/api\.openai\.com|api\.tavily\.com|link-search\.api\.cj\.com/.test(url))
    throw new Error("A feed reader must not contact collection providers.");
  return originalFetch(value, options);
};
