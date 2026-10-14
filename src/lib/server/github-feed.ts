import { cacheSchema, type OffersResponse } from "../offers";
import { boundedJson } from "./bounded-input";

type Cache = Omit<OffersResponse, "newOfferIds">;
const snapshots = new Map<string, { data: Cache; until: number }>();
const pending = new Map<string, Promise<Cache>>();

export function usesGithubFeed() {
  const mode = process.env.PROMOTION_FEED ?? "local";
  if (!["local", "github"].includes(mode))
    throw new Error("PROMOTION_FEED must be local or github.");
  return mode === "github";
}

export async function readGithubFeed(force = false): Promise<Cache> {
  const repository = process.env.PROMOTION_FEED_REPOSITORY || "thembaxx/procodiapp";
  if (
    !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    repository.split("/").some((part) => part === "." || part === "..")
  )
    throw new Error("Invalid promotion feed repository.");
  const cached = snapshots.get(repository);
  if (!force && cached && cached.until > Date.now()) return cached.data;
  let request = pending.get(repository);
  if (!request) {
    request = (async () => {
      try {
        const response = await fetch(
          `https://raw.githubusercontent.com/${repository}/promotion-data/offers.json`,
          {
            redirect: "error",
            cache: "no-store",
            signal: AbortSignal.timeout(8000),
            headers: { Accept: "application/json", "User-Agent": "LittleLess/1.0" },
          },
        );
        if (!response.ok) throw new Error("Scheduled promotion feed is unavailable.");
        const data = cacheSchema.parse(await boundedJson(response, 2_000_000));
        if (
          data.mode !== "free_sources" ||
          !data.updatedAt ||
          Date.parse(data.updatedAt) > Date.now() + 60_000 ||
          data.offers.some(
            (offer) =>
              Date.parse(offer.validUntil) - Date.parse(offer.checkedAt) > 86400_000 + 1000,
          )
        )
          throw new Error("Invalid scheduled promotion feed.");
        snapshots.set(repository, { data, until: Date.now() + 60_000 });
        return data;
      } catch {
        // An outage never renews any offer or the last successful scan timestamp.
        if (cached) return cached.data;
        throw new Error("Scheduled promotion feed is unavailable.");
      } finally {
        pending.delete(repository);
      }
    })();
    pending.set(repository, request);
  }
  return request;
}
