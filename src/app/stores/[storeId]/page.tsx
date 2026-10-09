import { notFound } from "next/navigation";
import { ContentShell } from "@/components/content-shell";
import { StructuredData } from "@/components/structured-data";
import { Icon } from "@/components/icon";
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { pageMetadata, siteConfig, siteName } from "@/lib/site";
import { getStore } from "@/lib/stores";
import { storeContent } from "@/lib/store-content";
import { filterOffers } from "@/lib/offers";
import { readCache } from "@/lib/server/storage";

type Props = { params: Promise<{ storeId: string }> };
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: Props) {
  const store = getStore((await params).storeId);
  if (!store) return { title: "Store not found", robots: { index: false } };
  return pageMetadata(
    `${store.name} coupon codes & grocery promotions`,
    storeContent[store.id].intro,
    `/stores/${store.id}`,
  );
}
const formatTime = (date: string) =>
  new Date(date).toLocaleString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Johannesburg",
  }) + " SAST";
export default async function StorePage({ params }: Props) {
  const store = getStore((await params).storeId);
  if (!store) notFound();
  const cache = await readCache();
  const offers = filterOffers(cache.offers).filter((offer) => offer.storeId === store.id);
  const content = storeContent[store.id];
  const { origin } = siteConfig();
  return (
    <ContentShell>
      {origin && (
        <StructuredData
          data={{
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: siteName, item: origin },
              { "@type": "ListItem", position: 2, name: "Stores", item: `${origin}/stores` },
              {
                "@type": "ListItem",
                position: 3,
                name: store.name,
                item: `${origin}/stores/${store.id}`,
              },
            ],
          }}
        />
      )}
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <a href="/stores">All stores</a>
        <span aria-hidden="true">/</span>
        <span>{store.name}</span>
      </nav>
      <span className="eyebrow">{store.loyalty.toUpperCase()}</span>
      <h1>
        {store.name}
        <br />
        <em>promotions.</em>
      </h1>
      <p className="content-intro">{content.intro}</p>
      <a className="content-cta" href={`/?store=${store.id}`}>
        Search, copy & save in the app <Icon icon={ArrowUpRight01Icon} size={18} />
      </a>
      <section className="content-section" aria-labelledby="current-promotions">
        <h2 id="current-promotions">
          {offers.length
            ? `${offers.length} current ${offers.length === 1 ? "promotion" : "promotions"}`
            : "Nothing confirmed just yet."}
        </h2>
        {offers.length ? (
          offers.map((offer) => (
            <article className="public-offer" key={offer.id}>
              <span className="eyebrow">
                {offer.type === "free_delivery" ? "FREE DELIVERY" : "DISCOUNT"}
              </span>
              <h3>{offer.title}</h3>
              <p>{offer.criteria}</p>
              <dl>
                <div>
                  <dt>Code</dt>
                  <dd>{offer.code ? <code>{offer.code}</code> : "No code needed"}</dd>
                </div>
                <div>
                  <dt>Expiry</dt>
                  <dd>
                    {offer.expiresAt ? (
                      <time dateTime={offer.expiresAt}>{formatTime(offer.expiresAt)}</time>
                    ) : (
                      "Ongoing benefit · no end date listed"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Last reviewed</dt>
                  <dd>
                    <time dateTime={offer.checkedAt}>{formatTime(offer.checkedAt)}</time>
                  </dd>
                </div>
                <div>
                  <dt>Review valid until</dt>
                  <dd>
                    <time dateTime={offer.validUntil}>{formatTime(offer.validUntil)}</time>
                  </dd>
                </div>
              </dl>
              <p className="content-note">
                {offer.verified
                  ? "Tested at checkout."
                  : "Source listed · not tested at checkout. Confirm eligibility before ordering."}
              </p>
              <a
                className="content-link"
                href={offer.sourceUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Read {offer.sourceName} terms <Icon icon={ArrowUpRight01Icon} size={16} />
              </a>
            </article>
          ))
        ) : (
          <p>
            We have no fresh, confirmed online grocery offer for this store. Check the official
            retailer for other promotions, or refresh the sources in the app. We never guess a
            coupon code.
          </p>
        )}
      </section>
      <section className="content-section">
        <h2>Before you shop</h2>
        <ul>
          {content.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
        <a className="content-link" href={store.url} rel="noopener noreferrer" target="_blank">
          Visit {store.name} <Icon icon={ArrowUpRight01Icon} size={16} />
        </a>
      </section>
      <section className="content-section">
        <h2>Where these listings come from</h2>
        <p>
          We review accessible public retailer pages and, when configured, search for further
          evidence. Expired, unknown-expiry and stale listings are excluded. A recurring membership
          benefit can have no published end date, but still needs a fresh review.
        </p>
        <a className="content-link" href="/about">
          How we check offers <Icon icon={ArrowUpRight01Icon} size={16} />
        </a>
      </section>
    </ContentShell>
  );
}
