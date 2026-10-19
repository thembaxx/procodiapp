import { discoverOffers, requireDiscovery } from "./discovery";
import { readGithubFeed, usesGithubFeed } from "./github-feed";
import { readCache, takeRefreshSlot, PUBLIC_DISCOVERY_COOLDOWN_SECONDS } from "./storage";
import { filterOffers, type OffersResponse } from "../offers";

export class DiscoveryBusyError extends Error {
  constructor(public readonly retryAfter: number) {
    super("A promotion scan is already running or cooling down.");
  }
}

export function hasCompletedDiscovery(
  data: Pick<OffersResponse, "mode" | "checks" | "updatedAt">,
): boolean {
  return (
    data.mode === "free_sources" &&
    !!data.updatedAt &&
    Date.now() - Date.parse(data.updatedAt) >= -60_000 &&
    Date.now() - Date.parse(data.updatedAt) < 86400_000 &&
    data.checks.some(
      (check) =>
        check.status === "checked" &&
        ((check.parsedPages ?? 0) > 0 || check.fallback === "checked"),
    )
  );
}

export async function refreshPromotions(): Promise<OffersResponse & { reused: boolean }> {
  if (usesGithubFeed()) {
    await readGithubFeed(true);
    const data = await readCache();
    return { ...data, offers: filterOffers(data.offers), newOfferIds: [], reused: true };
  }
  requireDiscovery();
  // Daily workers, cron and browsers share the same atomic database budget.
  const retryAfter = await takeRefreshSlot("discovery:global", PUBLIC_DISCOVERY_COOLDOWN_SECONDS);
  if (retryAfter) {
    const cache = await readCache();
    const age = cache.updatedAt ? Date.now() - Date.parse(cache.updatedAt) : Infinity;
    if (hasCompletedDiscovery(cache) && age >= 0 && age < PUBLIC_DISCOVERY_COOLDOWN_SECONDS * 1000)
      return { ...cache, offers: filterOffers(cache.offers), newOfferIds: [], reused: true };
    throw new DiscoveryBusyError(retryAfter);
  }
  const data = await discoverOffers();
  return { ...data, offers: filterOffers(data.offers), reused: false };
}
