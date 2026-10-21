import { ContentShell } from "@/components/content-shell";
import { Icon } from "@/components/icon";
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { pageMetadata } from "@/lib/site";
import { stores } from "@/lib/stores";
import { storeCatalogue } from "@/lib/store-catalogue";
import { filterOffers } from "@/lib/offers";
import { readCache } from "@/lib/server/storage";

export const dynamic = "force-dynamic";
export const generateMetadata = () =>
  pageMetadata(
    "South African grocery stores & promotions",
    "Browse verified promotions from six tracked grocery feeds and explore supported South African retailers.",
    "/stores",
  );
export default async function StoresPage() {
  const cache = await readCache();
  const live = filterOffers(cache.offers);
  const trackedIds = new Set<string>(stores.map((store) => (store.id === "pnp" ? "pick-n-pay" : store.id)));
  const moreStores = storeCatalogue.filter((store) => !trackedIds.has(store.id));
  return (
    <ContentShell>
      <span className="eyebrow">YOUR STORES, IN ONE PLACE</span>
      <h1>
        Find your next
        <br />
        <em>little saving.</em>
      </h1>
      <p className="content-intro">
        Browse current source-listed promotions from tracked grocery stores, or discover other
        supported retailers through their websites. Other stores may not have verified offers yet.
      </p>
      <h2 className="directory-section-heading">Stores with promotion feeds</h2>
      <div className="directory-grid">
        {stores.map((store) => {
          const count = live.filter((offer) => offer.storeId === store.id).length;
          return (
            <a className="directory-card" href={`/stores/${store.id}`} key={store.id}>
              <span
                className="directory-mark"
                style={{ background: store.secondary, color: store.ink }}
              >
                {store.monogram}
              </span>
              <h2>{store.name}</h2>
              <p>{store.loyalty}</p>
              <span className="directory-count">
                {count
                  ? `${count} current ${count === 1 ? "promotion" : "promotions"}`
                  : "No confirmed promotions right now"}
                <Icon icon={ArrowUpRight01Icon} size={18} />
              </span>
            </a>
          );
        })}
      </div>
      <h2 className="directory-section-heading">More supported stores</h2>
      <p className="content-intro">
        You can add these stores to your preferences on the home page. Their links open retailers'
        websites and do not imply we have confirmed promotions.
      </p>
      <div className="directory-grid">
        {moreStores.map((store) => (
          <a
            className="directory-card"
            href={store.url}
            target="_blank"
            rel="noopener noreferrer"
            key={store.id}
            aria-label={"Visit " + store.name + " website (opens in a new tab)"}
          >
            <span className="directory-mark directory-mark-generic" aria-hidden="true">
              {store.name.slice(0, 2).toUpperCase()}
            </span>
            <h2>{store.name}</h2>
            <p>{store.category}</p>
            <span className="directory-count">
              Visit retailer <Icon icon={ArrowUpRight01Icon} size={18} />
            </span>
          </a>
        ))}
      </div>
      <p className="content-note">
        Listings expire after 24 hours without a successful source review. No listing means we have
        no fresh confirmed offer; the retailer may still have other promotions.
      </p>
    </ContentShell>
  );
}
