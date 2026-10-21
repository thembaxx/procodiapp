import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { auditPromotionFeed } from "../../src/lib/server/promotion-feed-audit";
import { sourceSnapshot } from "../../src/lib/snapshot";

const now = Date.parse("2026-10-21T08:00:00Z");
function feed() {
  return {
    mode: "free_sources",
    updatedAt: new Date(now).toISOString(),
    checks: [{ storeId: "woolworths", status: "checked", pages: 1 }],
    offers: [
      {
        ...sourceSnapshot[0],
        checkedAt: new Date(now - 60_000).toISOString(),
        validUntil: new Date(now + 3600_000).toISOString(),
        expiresAt: null as string | null,
        ongoing: true,
        expiryKnown: true,
        verified: false,
        collectionMethod: "reviewed_source",
      },
    ],
  };
}
it("accepts source-confirmed membership benefits without claiming a checkout test", () => {
  const result = auditPromotionFeed(feed(), now);
  expect(result.result).toBe("pass");
  expect(result.sourceListed).toBe(1);
  expect(result.checkoutTested).toBe(0);
  expect(result.warnings).toContain("1 source-listed offers are not tested at checkout");
});
it("separately counts checkout-tested offers", () => {
  const data = feed();
  data.offers[0].verified = true;
  expect(auditPromotionFeed(data, now)).toMatchObject({
    result: "pass",
    checkoutTested: 1,
    sourceListed: 0,
  });
});
it.each([
  [
    "missing provenance",
    (data: ReturnType<typeof feed>) => {
      data.offers[0].collectionMethod = "";
    },
  ],
  [
    "third-party evidence",
    (data: ReturnType<typeof feed>) => {
      data.offers[0].sourceUrl = "https://www.wethrift.com/woolworths";
    },
  ],
  [
    "unapproved origin",
    (data: ReturnType<typeof feed>) => {
      data.offers[0].sourceUrl = "https://evil.example/coupon";
    },
  ],
  [
    "missing expiry",
    (data: ReturnType<typeof feed>) => {
      data.offers[0].expiryKnown = false;
    },
  ],
  [
    "stale offer",
    (data: ReturnType<typeof feed>) => {
      data.offers[0].validUntil = new Date(now - 1).toISOString();
    },
  ],
  [
    "expired promotion",
    (data: ReturnType<typeof feed>) => {
      data.offers[0].expiresAt = new Date(now - 1).toISOString();
    },
  ],
  [
    "future check",
    (data: ReturnType<typeof feed>) => {
      data.offers[0].checkedAt = new Date(now + 120_000).toISOString();
    },
  ],
  [
    "extended verification window",
    (data: ReturnType<typeof feed>) => {
      data.offers[0].validUntil = new Date(now + 2 * 86400_000).toISOString();
    },
  ],
  [
    "missing evidence",
    (data: ReturnType<typeof feed>) => {
      data.offers[0].evidence = "";
    },
  ],
  [
    "duplicate ID",
    (data: ReturnType<typeof feed>) => {
      data.offers.push({ ...data.offers[0] });
    },
  ],
  [
    "stale scan",
    (data: ReturnType<typeof feed>) => {
      data.updatedAt = new Date(now - 37 * 3600_000).toISOString();
    },
  ],
  [
    "future scan",
    (data: ReturnType<typeof feed>) => {
      data.updatedAt = new Date(now + 3600_000).toISOString();
    },
  ],
  [
    "no checked source",
    (data: ReturnType<typeof feed>) => {
      data.checks = [];
    },
  ],
])("fails closed on %s", (_name, mutate) => {
  const data = feed();
  mutate(data);
  expect(auditPromotionFeed(data, now).result).toBe("fail");
});
it("rejects malformed feeds and accepts an honest empty scan with a warning", () => {
  expect(auditPromotionFeed({}, now).result).toBe("fail");
  expect(auditPromotionFeed({ ...feed(), offers: [] }, now)).toMatchObject({
    result: "pass",
    warnings: ["No publishable offers found"],
  });
});
it("does not report a Worker deployment as successful when its credential is missing", () => {
  const workflow = readFileSync(".github/workflows/deploy-coupon-worker.yml", "utf8");
  const missing =
    workflow.match(
      /if\s+test\s+-n\s+"\$CLOUDFLARE_API_TOKEN"\s*;\s*then[\s\S]*?\n\s*else\s*\n([\s\S]*?)\n\s*fi/,
    )?.[1] ?? "";
  expect(missing).not.toBe("");
  expect(missing).toContain("echo 'ready=false' >> \"$GITHUB_OUTPUT\"");
  expect(missing).toContain("exit 1");
  expect(missing).toContain("no migration or deployment occurred");
});
