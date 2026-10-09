import { ContentShell } from "@/components/content-shell";
import { pageMetadata, siteName } from "@/lib/site";
export const dynamic = "force-dynamic";
export const generateMetadata = () =>
  pageMetadata(
    "How we find and check grocery promotions",
    `Learn how ${siteName} reviews public sources, checks expiry dates and labels online grocery coupons, delivery offers and membership benefits.`,
    "/about",
  );
export default function AboutPage() {
  return (
    <ContentShell>
      <span className="eyebrow">THE SMALL PRINT, MADE SIMPLE</span>
      <h1>
        Good deals.
        <br />
        <em>Clear details.</em>
      </h1>
      <p className="content-intro">
        {siteName} is an independent tool for finding South African online grocery promotions.
        Retailers own their names and marks. We are not affiliated with them and use no affiliate
        links.
      </p>
      <section className="content-section">
        <h2>Evidence first</h2>
        <p>
          We check accessible public retailer pages. When web search and extraction are configured,
          we also look for additional promotions on supported public domains. Sources must permit
          automated access. Every listing includes qualifying criteria, a source link and a review
          time.
        </p>
        <p>
          AI-assisted extraction treats source pages as untrusted data and checks quoted evidence
          against the page. It can still misinterpret unusual terms. We do not invent codes,
          guarantee checkout success or claim that source-listed offers have been tested.
        </p>
      </section>
      <section className="content-section">
        <h2>Fresh means reviewed</h2>
        <p>
          A listing stays visible for at most 24 hours without a successful source check. Published
          expiry dates are checked separately; expired offers disappear immediately. Date-only
          expiry means the end of that day in South Africa, using Africa/Johannesburg time (UTC+2).
        </p>
        <p>
          Only an explicitly recurring membership benefit can have no published end date. It is
          labelled as ongoing and must still pass the freshness check. A failed source check never
          extends an offer's validity.
        </p>
      </section>
      <section className="content-section">
        <h2>Membership benefits and coupon codes</h2>
        <p>
          A no-code benefit may require a paid membership, qualifying basket, account or delivery
          channel. Read the criteria before ordering. Woolworths online delivery eligibility does
          not automatically include Dash; in-store promotions do not automatically apply online.
        </p>
      </section>
      <section className="content-section">
        <h2>Something changed?</h2>
        <p>
          Open a promotion's Details & terms in the app and choose Report not working. Reports are
          stored for review. The retailer's current terms and checkout determine eligibility.
        </p>
        <a className="content-cta" href="/">
          Explore the latest listings
        </a>
      </section>
      <section className="content-section">
        <h2>Questions shoppers ask</h2>
        <details className="content-faq">
          <summary>Are all promotions coupon codes?</summary>
          <p>
            No. Some benefits apply without a code, often through membership or a qualifying order.
            They are labelled No code needed.
          </p>
        </details>
        <details className="content-faq">
          <summary>Can I use the app offline?</summary>
          <p>
            After one online visit has saved the app and listings, you can browse, search, save and
            copy offline. Expired or stale offers stay hidden. Refreshing sources and sending
            reports require a connection.
          </p>
        </details>
        <details className="content-faq">
          <summary>Why does a store have no offers?</summary>
          <p>
            We have no fresh, confirmed listing for that store. Sources may be unavailable or have
            no qualifying offer. The retailer may have other promotions, including personalised
            offers we cannot see.
          </p>
        </details>
      </section>
    </ContentShell>
  );
}
