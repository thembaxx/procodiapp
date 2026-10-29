import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

const fixture = JSON.parse(
  readFileSync(new URL("./retailer-fixtures.json", import.meta.url), "utf8"),
);
const sourceRoot = new URL("../src/", import.meta.url);
const moduleUrls = new Map();
const puppeteerBinding = "__procodiRetailerTestLaunch";

// Import the actual Worker and all local dependencies. Only the remote-browser
// transport is substituted; parsing, selectors and fallback logic stay unchanged.
function moduleUrl(file) {
  if (moduleUrls.has(file.href)) return moduleUrls.get(file.href);
  let source = stripTypeScriptTypes(readFileSync(file, "utf8"), { mode: "strip" });
  source = source.replace(/from\s+(["'])([^"']+)\1/g, (match, quote, specifier) => {
    if (specifier === "@cloudflare/puppeteer") {
      const stub = `export default { launch: async binding => globalThis[${JSON.stringify(puppeteerBinding)}](binding) };`;
      return `from ${JSON.stringify("data:text/javascript;base64," + Buffer.from(stub).toString("base64"))}`;
    }
    if (!specifier.startsWith(".")) return match;
    return `from ${JSON.stringify(moduleUrl(new URL(`${specifier}.ts`, file)))}`;
  });
  const url = "data:text/javascript;base64," + Buffer.from(source).toString("base64");
  moduleUrls.set(file.href, url);
  return url;
}

const { SCRAPE_TARGETS, parseCouponText, scrapeTargetNative, scrapeTarget } = await import(
  moduleUrl(new URL("index.ts", sourceRoot))
);
const { collectRetailerTexts } = await import(
  moduleUrl(new URL("puppeteer-scraper.ts", sourceRoot))
);
const target = SCRAPE_TARGETS.find((item) => item.merchant === "SPAR");
assert.ok(target);
const now = "2026-10-26T12:00:00.000Z";
const originalFetch = globalThis.fetch;

test.beforeEach(() => {
  globalThis.fetch = async () => {
    throw new Error("Unexpected network request in offline retailer tests");
  };
  globalThis[puppeteerBinding] = async () => {
    throw new Error("Unexpected remote browser launch in offline retailer tests");
  };
});
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  delete globalThis[puppeteerBinding];
});

function quickActionEnv(results) {
  return {
    BROWSER: {
      async quickAction(action, options) {
        assert.equal(action, "scrape");
        assert.equal(options.url, target.url);
        assert.deepEqual(
          options.elements,
          target.selectors.map((selector) => ({ selector })),
        );
        return Response.json({ success: true, result: [{ results }] });
      },
    },
  };
}

test("rejects concatenated prices and percentages outside 0–100", async () => {
  for (const text of fixture.invalidPercentages) {
    assert.deepEqual(await parseCouponText(text, target.merchant, target.url, now), [], text);
  }
  for (const text of ["Fixture offer 1% off", "Fixture offer 57% off", "Fixture offer 100% off"]) {
    const parsed = await parseCouponText(text, target.merchant, target.url, now);
    assert.equal(parsed.length, 1, text);
    assert.equal(parsed[0].merchant, target.merchant);
    assert.equal(parsed[0].source_url, target.url);
    assert.equal(parsed[0].found_at, now);
  }
});

test("missing selectors, empty text and malformed browser responses are failures", async () => {
  for (const results of [[], [{ text: "  " }], [{ html: "not readable text" }]]) {
    await assert.rejects(
      scrapeTargetNative(quickActionEnv(results), target),
      /no readable content/,
    );
  }
  await assert.rejects(
    scrapeTargetNative(
      { BROWSER: { quickAction: async () => Response.json({ success: false }) } },
      target,
    ),
    /unexpected browser scrape response/,
  );
});

test("readable cards without qualifying savings are an honest empty result", async () => {
  const env = quickActionEnv([{ text: fixture.unqualifiedText }]);
  assert.deepEqual(await scrapeTargetNative(env, target), []);
  assert.deepEqual(await scrapeTarget(env, target), []);
});

test("native cards deduplicate parsed leads while retaining retailer provenance", async () => {
  const text = "Fixture pantry bundle. Save R20. Valid until 2026-10-31.";
  const parsed = await scrapeTargetNative(quickActionEnv([{ text }, { text }]), target);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].discount, "Save R20");
  assert.equal(parsed[0].expires_at, "2026-10-31");
  assert.equal(parsed[0].source_url, target.url);
});

test("empty optional extraction preserves the original retailer failure", async () => {
  const originalError = new Error("retailer selectors matched no readable content");
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === new URL("/robots.txt", target.url).href)
      return new Response("User-agent: *\nAllow: /");
    assert.equal(url, "https://api.firecrawl.dev/v2/scrape");
    return Response.json({
      success: true,
      data: { markdown: fixture.unqualifiedText, metadata: { sourceURL: target.url } },
    });
  };
  const env = {
    FIRECRAWL_ENABLED: "true",
    FIRECRAWL_API_KEY: "offline-fixture-key",
    DB: { prepare: () => ({ bind: () => ({ first: async () => ({ requests: 1 }) }) }) },
    BROWSER: {
      quickAction: async () => {
        throw originalError;
      },
    },
  };
  await assert.rejects(scrapeTarget(env, target), (error) => error === originalError);
  assert.equal(calls.length, 2);
});

test("Puppeteer missing-selector failure closes its browser and is not empty success", async () => {
  const makro = SCRAPE_TARGETS.find((item) => item.merchant === "Makro");
  assert.ok(makro?.usePuppeteer);
  let closed = false;
  globalThis[puppeteerBinding] = async () => ({
    newPage: async () => ({
      setViewport: async () => {},
      setRequestInterception: async () => {},
      on() {},
      goto: async () => ({ ok: () => true }),
      waitForSelector: async () => {
        throw new Error("Waiting for selector failed: Waiting failed: 10000ms exceeded");
      },
    }),
    close: async () => {
      closed = true;
    },
  });
  await assert.rejects(scrapeTargetNative({ BROWSER: {} }, makro), /retailer selector timeout/);
  assert.equal(closed, true);
});

// Worker-only CI installs no frontend browser tooling. Run the optional actual-DOM
// check after installing root dev dependencies and Playwright Chromium, or set
// PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to a local Chromium executable.
let chromium;
try {
  ({ chromium } = await import("@playwright/test"));
} catch {
  // The six transport/parser tests above still run in the isolated Worker job.
}
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browserAvailable = chromium && existsSync(executablePath || chromium.executablePath());
if (process.env.RETAILER_FIXTURE_BROWSER === "true" && !browserAvailable) {
  throw new Error(
    "Retailer fixture browser was required, but Playwright Chromium is not installed.",
  );
}
test(
  "offline DOM fixtures preserve Makro/SPAR card and discount boundaries",
  {
    skip: browserAvailable ? false : "Install root Playwright Chromium to run actual-DOM fixtures",
  },
  async () => {
    const browser = await chromium.launch({ executablePath, headless: true });
    try {
      const context = await browser.newContext({ serviceWorkers: "block" });
      const requests = [];
      await context.route("**/*", (route) => {
        requests.push(route.request().url());
        return route.abort();
      });
      const page = await context.newPage();
      for (const card of fixture.cards) {
        const retailer = SCRAPE_TARGETS.find((item) => item.merchant === card.merchant);
        assert.ok(retailer);
        await page.setContent(card.html);
        const texts = await page.$$eval(retailer.selectors.join(", "), collectRetailerTexts);
        assert.equal(texts.length, card.expectedCards, card.merchant);
        const parsed = (
          await Promise.all(
            texts.map((text) => parseCouponText(text, retailer.merchant, retailer.url, now)),
          )
        ).flat();
        assert.deepEqual(
          parsed.map((item) => item.discount),
          card.expectedDiscounts,
        );
        if (card.merchant === "Makro") {
          const concatenated = await page.$eval(
            "div._4ddWXP[data-tkid]",
            (element) => element.textContent,
          );
          assert.match(concatenated, /39957% off/);
          assert.deepEqual(
            await parseCouponText(concatenated, retailer.merchant, retailer.url, now),
            [],
          );
        }
      }
      await page.setContent("<main>Page layout changed; no retailer card selectors.</main>");
      assert.deepEqual(await page.$$eval(target.selectors.join(", "), collectRetailerTexts), []);
      await page.setContent(
        Array.from({ length: 105 }, (_, n) => `<div>Fixture card ${n}</div>`).join(""),
      );
      assert.equal((await page.$$eval("div", collectRetailerTexts)).length, 100);
      assert.deepEqual(requests, []);
    } finally {
      await browser.close();
    }
  },
);
