import test from "node:test";
import assert from "node:assert/strict";
import { inspectSource } from "../../scripts/scraper-health-policy.mjs";

const now = Date.parse("2026-10-26T10:00:00Z");
const source = {
  merchant: "Makro", consecutive_failures: 9, last_error_code: "browser_rate_limited",
  checked_at: "2026-10-26T00:00:00Z",
};
test("operational monitor fails on persistent extraction errors", () => {
  const result = inspectSource(source, { now });
  assert.match(result.errors[0], /Makro: 9 consecutive failures \(browser_rate_limited\)/);
  assert.equal(result.warnings.length, 0);
});
test("deployment smoke warns for old extraction errors but validates schema", () => {
  const result = inspectSource(source, { now, deployment: true });
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.equal(inspectSource({ merchant: "SPAR", consecutive_failures: -1 }, { now, deployment: true }).errors.length, 1);
});
test("older unrefreshed checks are visible and a fresh healthy check passes", () => {
  assert.match(inspectSource({ ...source, consecutive_failures: 0, checked_at: "2026-10-20T00:00:00Z" }, { now }).warnings[0], /over 48 hours/);
  assert.deepEqual(inspectSource({ ...source, consecutive_failures: 0, checked_at: "2026-10-26T00:00:00Z" }, { now }), { errors: [], warnings: [] });
});
