import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const { parseConfigFileTextToJson } = createRequire(import.meta.url)("typescript");
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const { config, error } = parseConfigFileTextToJson("wrangler.jsonc", read("../wrangler.jsonc"));
assert.equal(error, undefined, "Wrangler configuration must be valid JSONC");
const source = read("../src/index.ts");
const schema = read("../schema.sql");
test("cron runs at 02:00 and 14:00 SAST", () => {
  assert.deepEqual(config.triggers.crons, ["0 */12 * * *"]);
});
test("queue processing is bounded and retries have a dead-letter queue", () => {
  assert.equal(config.queues.consumers[0].max_concurrency, 3);
  assert.equal(config.queues.consumers[0].max_batch_size, 1);
  assert.equal(config.queues.consumers[0].dead_letter_queue, "scrape-dlq");
});
test("Quick Actions use supported compatibility date and browser binding", () => {
  assert.ok(config.compatibility_date >= "2026-03-24");
  assert.equal(config.browser.binding, "BROWSER");
});
test("D1 migration preserves existing coupons", () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS coupons/i);
  assert.doesNotMatch(schema, /DROP TABLE|DELETE FROM coupons/i);
});
test("manual scrape endpoint fails closed", () => {
  assert.match(source, /!env\.API_KEY\s*\|\|/);
  assert.match(source, /unauthorized/);
});
test("public API hides internal exceptions", () => {
  assert.match(source, /internal server error/);
  assert.doesNotMatch(source, /json\(\{ error: String\(err\)/);
});
