import { ContentShell } from "@/components/content-shell";
import { Icon } from "@/components/icon";
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { pageMetadata } from "@/lib/site";
import { stores } from "@/lib/stores";
import { filterOffers } from "@/lib/offers";
import { readCache } from "@/lib/server/storage";

export const dynamic = "force-dynamic";
export const generateMetadata = () =>
  pageMetadata(
    "South African grocery stores & promotions",
    "Browse grocery coupon codes, delivery benefits and discounts by retailer. Check qualifying terms for six South African grocery stores.",
    "/stores",
  );
export default async function StoresPage() {
  const cache = await readCache();
  const live = filterOffers(cache.offers);
  return (
    <ContentShell>
      <span className="eyebrow">YOUR STORES, IN ONE PLACE</span>
      <h1>
        Find your next
        <br />
        <em>little saving.</em>
      </h1>
      <p className="content-intro">
        Browse current source-listed promotions by store. Membership, minimum basket and delivery
        channel matter — every listing includes the details.
      </p>
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
      <p className="content-note">
        Listings expire after 24 hours without a successful source review. No listing means we have
        no fresh confirmed offer; the retailer may still have other promotions.
      </p>
    </ContentShell>
  );
}
