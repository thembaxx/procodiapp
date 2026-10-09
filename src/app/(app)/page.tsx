import { GroceryApp } from "@/components/grocery-app";
import { readCache } from "@/lib/server/storage";
import { filterOffers } from "@/lib/offers";
import { StructuredData } from "@/components/structured-data";
import { siteConfig, siteName, siteDescription } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cache = await readCache();
  // oxlint-disable-next-line react/purity -- This dynamic server component captures one request timestamp for consistent hydration.
  const initialNow = Date.now();
  const { origin } = siteConfig();
  return (
    <>
      {origin && (
        <StructuredData
          data={{
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebSite",
                "@id": `${origin}/#website`,
                url: origin,
                name: siteName,
                description: siteDescription,
                inLanguage: "en-ZA",
              },
              {
                "@type": "WebApplication",
                name: siteName,
                url: origin,
                applicationCategory: "ShoppingApplication",
                operatingSystem: "Web",
                browserRequirements:
                  "JavaScript is required for search, copying and offline access.",
                description: siteDescription,
                isAccessibleForFree: true,
              },
            ],
          }}
        />
      )}
      <GroceryApp
        initialData={{
          ...cache,
          offers: filterOffers(cache.offers, "all", "", initialNow),
          newOfferIds: [],
        }}
        initialNow={initialNow}
      />
    </>
  );
}
