import type { ReactNode } from "react";
import {
  ArrowLeft01Icon,
  ArrowUpRight01Icon,
  ShoppingBasket01Icon,
} from "@hugeicons/core-free-icons";
import { Icon } from "./icon";
import { BrandWordmark } from "./brand-wordmark";

export function ContentShell({ children }: { children: ReactNode }) {
  return (
    <div className="content-page shell">
      <a href="#content" className="skip-link">
        Skip to content
      </a>
      <header className="content-header">
        <a href="/" className="content-brand">
          <Icon icon={ShoppingBasket01Icon} size={23} /> <BrandWordmark />
        </a>
        <a href="/" className="content-back">
          <Icon icon={ArrowLeft01Icon} size={17} /> Back to offers
        </a>
      </header>
      <main id="content">{children}</main>
      <footer className="content-footer">
        <p>Independent. Made for South Africa.</p>
        <nav aria-label="Information">
          <a href="/stores">All stores</a>
          <a href="/about">How we find offers</a>
          <a href="/privacy">Privacy</a>
          <a href="/">
            Find a saving <Icon icon={ArrowUpRight01Icon} size={15} />
          </a>
        </nav>
      </footer>
    </div>
  );
}
