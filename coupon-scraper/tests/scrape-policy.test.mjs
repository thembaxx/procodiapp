import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

const source = readFileSync(new URL("../src/scrape-policy.ts", import.meta.url), "utf8");
const transpiled = stripTypeScriptTypes(source, { mode: "strip" });
const { BROWSER_SPACING_SECONDS, pacedJobs, classifyScrapeError } = await import(
  "data:text/javascript;base64," + Buffer.from(transpiled).toString("base64")
);

test("stagger queued retailer jobs by 30 seconds with a bounded batch", () => {
  assert.equal(BROWSER_SPACING_SECONDS, 30);
  assert.deepEqual(pacedJobs([2, 4, 8]), [
    { body: { index: 2 }, delaySeconds: 0 },
    { body: { index: 4 }, delaySeconds: 30 },
    { body: { index: 8 }, delaySeconds: 60 },
  ]);
  assert.deepEqual(pacedJobs([]), []);
});

test("differentiate Browser Run rate limits from broken retailer extraction", () => {
  assert.deepEqual(
    classifyScrapeError(
      new Error("Unable to create new browser: code: 429: message: Rate limit exceeded"),
    ),
    {
      provider: "browser_run",
      code: "browser_rate_limited",
      httpStatus: 429,
    },
  );
  assert.deepEqual(classifyScrapeError(new Error("browser scrape returned 429")), {
    provider: "browser_run",
    code: "browser_rate_limited",
    httpStatus: 429,
  });
  assert.deepEqual(classifyScrapeError(new Error("browser scrape returned 422")), {
    provider: "browser_run",
    code: "browser_http_error",
    httpStatus: 422,
  });
  assert.equal(
    classifyScrapeError(new Error("Navigation timeout of 30000 ms exceeded")).code,
    "retailer_navigation_error",
  );
  assert.deepEqual(classifyScrapeError(new Error("retailer selector timeout")), {
    provider: "retailer",
    code: "retailer_selector_error",
    httpStatus: null,
  });
  assert.equal(classifyScrapeError(new Error("broken parser")).code, "scrape_error");
});
