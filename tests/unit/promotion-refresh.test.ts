import { beforeEach, expect, it, vi } from "vitest";
import { discoverOffers, requireWebDiscovery } from "../../src/lib/server/discovery";
import { readCache, takeRefreshSlot } from "../../src/lib/server/storage";
import { DiscoveryBusyError, refreshPromotions } from "../../src/lib/server/promotion-refresh";
import { sourceSnapshot } from "../../src/lib/snapshot";

vi.mock("../../src/lib/server/discovery", () => ({
  discoverOffers: vi.fn(),
  requireWebDiscovery: vi.fn(),
}));
vi.mock("../../src/lib/server/storage", () => ({
  readCache: vi.fn(),
  takeRefreshSlot: vi.fn(),
  PUBLIC_DISCOVERY_COOLDOWN_SECONDS: 600,
}));

beforeEach(() => {
  vi.resetAllMocks();
});
function recentCache() {
  return {
    offers: [
      {
        ...sourceSnapshot[0],
        checkedAt: new Date().toISOString(),
        validUntil: new Date(Date.now() + 60_000).toISOString(),
      },
    ],
    updatedAt: new Date().toISOString(),
    mode: "web_search" as const,
    checks: [
      {
        storeId: "checkers" as const,
        status: "checked" as const,
        pages: 1,
        searched: true,
        extractedPages: 1,
      },
    ],
  };
}

it("runs the scanner only after acquiring the shared cross-instance budget", async () => {
  vi.mocked(takeRefreshSlot).mockResolvedValue(0);
  vi.mocked(discoverOffers).mockResolvedValue({ ...recentCache(), newOfferIds: [] });
  expect((await refreshPromotions()).reused).toBe(false);
  expect(takeRefreshSlot).toHaveBeenCalledWith("discovery:global", 600);
  expect(discoverOffers).toHaveBeenCalledOnce();
});

it("loads a recently completed daily scan on refresh instead of spending on another search", async () => {
  vi.mocked(takeRefreshSlot).mockResolvedValue(400);
  const cache = recentCache();
  vi.mocked(readCache).mockResolvedValue(cache);
  expect(await refreshPromotions()).toEqual({ ...cache, reused: true, newOfferIds: [] });
  expect(discoverOffers).not.toHaveBeenCalled();
});

it("does not claim an old snapshot or incomplete extraction is an already completed scan", async () => {
  vi.mocked(takeRefreshSlot).mockResolvedValue(400);
  vi.mocked(readCache).mockResolvedValue({ ...recentCache(), updatedAt: null });
  await expect(refreshPromotions()).rejects.toBeInstanceOf(DiscoveryBusyError);
  vi.mocked(readCache).mockResolvedValue({ ...recentCache(), checks: [] });
  await expect(refreshPromotions()).rejects.toBeInstanceOf(DiscoveryBusyError);
  expect(discoverOffers).not.toHaveBeenCalled();
});

it("fails missing provider configuration before consuming the budget", async () => {
  vi.mocked(requireWebDiscovery).mockImplementation(() => {
    throw new Error("Not configured");
  });
  await expect(refreshPromotions()).rejects.toThrow("Not configured");
  expect(takeRefreshSlot).not.toHaveBeenCalled();
});
