import { discoverOffers, requireWebDiscovery } from "./discovery";
import { readCache, takeRefreshSlot, PUBLIC_DISCOVERY_COOLDOWN_SECONDS } from "./storage";
import { filterOffers, type OffersResponse } from "../offers";

export class DiscoveryBusyError extends Error {
  constructor(public readonly retryAfter: number) {
    super("A promotion scan is already running or cooling down.");
  }
}

export function hasWebDiscovery(data: Pick<OffersResponse, "mode" | "checks">): boolean {
  return (
    data.mode === "web_search" &&
    data.checks.some((check) => check.searched && (check.extractedPages ?? 0) > 0)
  );
}

export async function refreshPromotions(): Promise<OffersResponse & { reused: boolean }> {
  requireWebDiscovery();
  // Daily workers, cron and browsers share the same atomic database budget.
  const retryAfter = await takeRefreshSlot("discovery:global", PUBLIC_DISCOVERY_COOLDOWN_SECONDS);
  if (retryAfter) {
    const cache = await readCache();
    const age = cache.updatedAt ? Date.now() - Date.parse(cache.updatedAt) : Infinity;
    if (hasWebDiscovery(cache) && age >= 0 && age < PUBLIC_DISCOVERY_COOLDOWN_SECONDS * 1000)
      return { ...cache, offers: filterOffers(cache.offers), newOfferIds: [], reused: true };
    throw new DiscoveryBusyError(retryAfter);
  }
  const data = await discoverOffers();
  return { ...data, offers: filterOffers(data.offers), reused: false };
}
