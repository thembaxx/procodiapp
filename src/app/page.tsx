import { GroceryApp } from "@/components/grocery-app";
import { readCache } from "@/lib/server/storage";
import { filterOffers } from "@/lib/offers";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cache = await readCache();
  // oxlint-disable-next-line react/purity -- This dynamic server component captures one request timestamp for consistent hydration.
  const initialNow = Date.now();
  return (
    <GroceryApp
      initialData={{
        ...cache,
        offers: filterOffers(cache.offers, "all", "", initialNow),
        newOfferIds: [],
      }}
      initialNow={initialNow}
    />
  );
}
