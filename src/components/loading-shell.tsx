import { ShoppingBasket01Icon } from "@hugeicons/core-free-icons";
import { BrandWordmark } from "./brand-wordmark";
import { Icon } from "./icon";

export default function Loading() {
  return (
    <main className="loading-page" aria-busy="true" aria-label="Loading grocery promotions">
      <div className="shell">
        <header className="site-header">
          <span className="brand">
            <span className="brand-icon">
              <Icon icon={ShoppingBasket01Icon} size={25} />
            </span>
            <BrandWordmark />
          </span>
        </header>
        <div className="loading-content">
          <output className="eyebrow loading-message">Finding a little less at checkout…</output>
          <div className="loading-skeletons" aria-hidden="true">
            <span className="skeleton skeleton-heading" />
            <span className="skeleton skeleton-subtitle" />
            <span className="skeleton skeleton-search" />
            <div className="skeleton-store-grid">
              {[0, 1, 2].map((card) => (
                <div className="skeleton skeleton-store" key={card}>
                  <span />
                  <span />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
