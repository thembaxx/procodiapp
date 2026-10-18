import { afterEach, expect, it, vi } from "vitest";
import { readGithubFeed, usesGithubFeed } from "../../src/lib/server/github-feed";
import { readCache, writeCache } from "../../src/lib/server/storage";
import { sourceSnapshot } from "../../src/lib/snapshot";
import { hasCompletedDiscovery, refreshPromotions } from "../../src/lib/server/promotion-refresh";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function cache() {
  const now = Date.now();
  return {
    offers: [
      {
        ...sourceSnapshot[0],
        checkedAt: new Date(now).toISOString(),
        validUntil: new Date(now + 86400_000).toISOString(),
      },
    ],
    updatedAt: new Date(now).toISOString(),
    mode: "free_sources",
    checks: [
      { storeId: "checkers", status: "checked", pages: 1, parsedPages: 1, fallback: "not_needed" },
    ],
  };
}
it("defaults Vercel production to the scheduled feed while respecting an explicit local override", () => {
  vi.stubEnv("PROMOTION_FEED", undefined);
  vi.stubEnv("VERCEL_ENV", "production");
  expect(usesGithubFeed()).toBe(true);
  vi.stubEnv("PROMOTION_FEED", "local");
  expect(usesGithubFeed()).toBe(false);
  vi.stubEnv("PROMOTION_FEED", undefined);
  vi.stubEnv("VERCEL_ENV", "preview");
  expect(usesGithubFeed()).toBe(false);
  vi.stubEnv("VERCEL_ENV", undefined);
  expect(usesGithubFeed()).toBe(false);
});
it("reads and refreshes the published feed without running discovery or forwarding keys", async () => {
  vi.stubEnv("PROMOTION_FEED", "github");
  vi.stubEnv("PROMOTION_FEED_REPOSITORY", "test/feed-success");
  vi.stubEnv("CJ_API_TOKEN", "must-not-be-forwarded");
  vi.stubEnv("GEMINI_API_KEY", "must-not-be-forwarded");
  const data = cache(),
    fetch = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(
        "https://raw.githubusercontent.com/test/feed-success/promotion-data/offers.json",
      );
      expect(JSON.stringify(init?.headers)).not.toContain("must-not-be-forwarded");
      expect(init?.redirect).toBe("error");
      return Response.json({ ...data, privateMetadata: "must-be-stripped" });
    });
  vi.stubGlobal("fetch", fetch);
  expect(await readCache()).toEqual(data);
  expect(hasCompletedDiscovery(await readCache())).toBe(true);
  expect((await refreshPromotions()).reused).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(2);
  await expect(writeCache(data as Awaited<ReturnType<typeof readCache>>)).rejects.toThrow(
    "read-only",
  );
});
it("retains original deadlines on a feed outage and rejects stale scan success", async () => {
  vi.stubEnv("PROMOTION_FEED_REPOSITORY", "test/feed-outage");
  const data = cache();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(data))
    .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  await readGithubFeed();
  expect(await readGithubFeed(true)).toEqual(data);
  expect(
    hasCompletedDiscovery({
      ...data,
      mode: "free_sources",
      checks: [{ storeId: "checkers", status: "checked", pages: 1, parsedPages: 1 }],
      updatedAt: new Date(Date.now() - 86400_000).toISOString(),
    }),
  ).toBe(false);
});
it("fails closed on malformed or missing feeds and refuses arbitrary fetch origins", async () => {
  vi.stubEnv("PROMOTION_FEED_REPOSITORY", "test/feed-malformed");
  const fetch = vi.fn(async () => Response.json({ offers: "bad" }));
  vi.stubGlobal("fetch", fetch);
  await expect(readGithubFeed()).rejects.toThrow("unavailable");
  vi.stubEnv("PROMOTION_FEED_REPOSITORY", "https://127.0.0.1/private");
  await expect(readGithubFeed()).rejects.toThrow("Invalid");
  expect(fetch).toHaveBeenCalledOnce();
});
