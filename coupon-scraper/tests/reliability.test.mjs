import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Compile the actual Worker module; no test-only duplicate of validation logic.
const source = readFileSync(new URL("../src/reliability.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { parseReviewedOffer } = await import(
  "data:text/javascript;base64," + Buffer.from(transpiled.outputText).toString("base64")
);
const target = [
  { merchant: "Pick n Pay", url: "https://www.pnp.co.za/c/pnp/promotions", selectors: [] },
];
const now = new Date("2026-10-19T12:00:00.000Z");
const item = {
  id: "valid-test-offer",
  merchant: "Pick n Pay",
  storeId: "pnp",
  kind: "coupon_code",
  title: "Delivery saving for eligible customers",
  criteria: "Valid for new online customers shopping in South Africa",
  code: "SAVE123",
  channel: "online",
  region: "South Africa",
  sourceUrl: "https://www.pnp.co.za/c/pnp/promotions",
  evidence: "SAVE123 offer applies to eligible customers until 31 October 2026",
  ongoing: false,
  expiresAt: "2026-10-31T21:59:59.000Z",
};
test("reviewed official evidence can publish for at most 24 hours", () => {
  const approved = parseReviewedOffer(item, target, now);
  assert.equal(approved?.checkout_tested, 0);
  assert.equal(approved?.valid_until, "2026-10-20T12:00:00.000Z");
  assert.equal(approved?.source_url, item.sourceUrl);
});
test("reject foreign domain, invalid expiry, empty evidence and unsupported merchant", () => {
  for (const patch of [
    { sourceUrl: "https://fraud.example/promotions" },
    { sourceUrl: "http://www.pnp.co.za/c/pnp/promotions" },
    { expiresAt: "2026-10-18T12:00:00Z" },
    { expiresAt: null },
    { evidence: "unverified" },
    { merchant: "Unknown" },
    { kind: "coupon_code", code: null },
    { channel: "global" },
    { storeId: "not-valid" },
  ])
    assert.equal(parseReviewedOffer({ ...item, ...patch }, target, now), null);
});
test("ongoing benefits need explicit no-expiry confirmation and are never checkout tested", () => {
  const ongoing = parseReviewedOffer(
    {
      ...item,
      kind: "loyalty",
      code: null,
      ongoing: true,
      expiresAt: null,
      evidence: "The published benefit is ongoing with no listed end date.",
      checkoutTested: true,
    },
    target,
    now,
  );
  assert.equal(ongoing?.ongoing, 1);
  assert.equal(ongoing?.checkout_tested, 0);
  assert.equal(parseReviewedOffer({ ...item, ongoing: true }, target, now), null);
});
