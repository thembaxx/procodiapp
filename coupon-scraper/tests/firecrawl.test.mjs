import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

const source = readFileSync(new URL("../src/firecrawl.ts", import.meta.url), "utf8");
const js = stripTypeScriptTypes(source, { mode: "strip" });
const { robotsPermit, scrapeFirecrawlLeads } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
const target = {
  merchant: "Pick n Pay",
  url: "https://www.pnp.co.za/c/pnp/promotions",
  selectors: [],
};
const page = {
  success: true,
  data: {
    markdown: "## Today only\n\nSave R50 online groceries with code SAVE50. Expires 2099-12-31.",
    metadata: { sourceURL: target.url },
  },
};
const originalFetch = globalThis.fetch;

function setup({ enabled = "true", limit = "6", markdown = page.data.markdown, sourceURL = target.url } = {}) {
  const calls = [];
  let credits = 0;
  const env = {
    FIRECRAWL_ENABLED: enabled,
    FIRECRAWL_API_KEY: "test-only-secret",
    FIRECRAWL_DAILY_LIMIT: limit,
    DB: {
      prepare(sql) {
        assert.match(sql, /ON CONFLICT.*UPDATE/);
        return {
          bind(...args) {
            assert.equal(args[1], Number(limit));
            return {
              async first() {
                credits++;
                return credits <= Number(limit) ? { requests: credits } : null;
              },
            };
          },
        };
      },
    },
  };
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    calls.push({ url, options });
    if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /");
    assert.equal(url, "https://api.firecrawl.dev/v2/scrape");
    assert.equal(options.redirect, "error");
    assert.match(options.headers.Authorization, /^Bearer test-only-secret$/);
    assert.deepEqual(JSON.parse(options.body), {
      url: target.url,
      formats: ["markdown"],
      onlyMainContent: true,
      proxy: "basic",
      timeout: 12000,
    });
    return Response.json({ ...page, data: { ...page.data, markdown, metadata: { sourceURL } } });
  };
  return { env, calls, credits: () => credits };
}

test.afterEach(() => { globalThis.fetch = originalFetch; });

test("opt-in only: disabled Firecrawl neither fetches nor reserves quota", async () => {
  const { env, calls } = setup({ enabled: "false" });
  assert.equal(await scrapeFirecrawlLeads(env, target, async () => [], new Date().toISOString()), null);
  assert.equal(calls.length, 0);
});

test("respects explicit robots denial before spending a credit", async () => {
  assert.equal(robotsPermit("User-agent: Firecrawl\nDisallow: /c/\nAllow: /c/open", "/c/pnp"), false);
  const { env, calls, credits } = setup();
  globalThis.fetch = async () => new Response("User-agent: *\nDisallow: /");
  assert.equal(await scrapeFirecrawlLeads(env, target, async () => [], new Date().toISOString()), null);
  assert.equal(credits(), 0);
  assert.equal(calls.length, 0);
});

test("extracts unique bounded review leads, never marking them verified", async () => {
  const { env, calls, credits } = setup();
  const parse = async (text, merchant, sourceUrl, now) =>
    text.includes("SAVE50") ? [{
      id: "lead-1", code: "SAVE50", merchant, source_url: sourceUrl,
      title: text, description: text, discount: "R50", found_at: now, expires_at: null,
    }] : [];
  const leads = await scrapeFirecrawlLeads(env, target, parse, "2026-10-21T00:00:00Z");
  assert.equal(leads.length, 1);
  assert.equal(leads[0].source_url, target.url);
  assert.equal(credits(), 1);
  assert.equal(calls.filter((call) => call.url.includes("firecrawl.dev")).length, 1);
});

test("rejects redirected or unrelated source data after reserving quota", async () => {
  const { env } = setup({ sourceURL: "https://evil.example/coupon" });
  await assert.rejects(
    scrapeFirecrawlLeads(env, target, async () => [], new Date().toISOString()),
    /approved retailer/,
  );
});

test("applies an explicit zero-credit daily limit", async () => {
  const { env, calls } = setup({ limit: "0" });
  assert.equal(await scrapeFirecrawlLeads(env, target, async () => [], new Date().toISOString()), null);
  assert.equal(calls.filter((call) => call.url.includes("firecrawl.dev")).length, 0);
});
