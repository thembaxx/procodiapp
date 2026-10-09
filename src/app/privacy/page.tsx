import { ContentShell } from "@/components/content-shell";
import { pageMetadata, siteConfig, siteName } from "@/lib/site";
export const dynamic = "force-dynamic";
export const generateMetadata = () =>
  pageMetadata(
    "Privacy and device storage",
    `Understand what ${siteName} saves on your device, how reports and rate limits work, and how to remove saved preferences and offline data.`,
    "/privacy",
  );
export default function PrivacyPage() {
  const { contactEmail } = siteConfig();
  return (
    <ContentShell>
      <span className="eyebrow">YOUR DEVICE. YOUR CHOICES.</span>
      <h1>
        A little clarity.
        <br />
        <em>On privacy.</em>
      </h1>
      <p className="content-intro">
        You do not need an account. This app has no advertising cookies, analytics trackers or
        affiliate links.
      </p>
      <section className="content-section">
        <h2>What stays on your device</h2>
        <p>
          Theme, view, animation choices and saved promotion IDs live in local storage. The service
          worker caches the app's files; IndexedDB stores the last validated listing snapshot for
          offline access. Your searches and bookmarks are not sent to the discovery providers.
        </p>
        <p>
          Clear this site's browsing data in your browser to remove preferences, bookmarks, offline
          listings and cached app files. This resets your choices and removes offline access until
          another online visit. Removing the home-screen icon alone may not clear browser storage.
        </p>
      </section>
      <section className="content-section">
        <h2>Requests and reports</h2>
        <p>
          Refresh requests check public promotion sources. A report contains the promotion ID, your
          selected reason and its submission time. It has no free-text field or account identifier.
          Reports are stored for review by the app operator.
        </p>
        <p>
          To limit abuse, the server stores a SHA-256 hash of the client address supplied by a
          trusted ingress, or a shared local bucket when proxy trust is disabled. The app does not
          store raw IP addresses in promotion or rate-limit records. Hashes are pseudonymous, not
          guaranteed anonymous. Limits last one minute; expired limit records are cleaned up during
          later requests.
        </p>
        <p>
          The hosting provider may process IP addresses and request logs independently. Reports
          remain stored until the operator removes them. Contact the operator to ask about retention
          or request deletion of a report.
        </p>
      </section>
      <section className="content-section">
        <h2>External services</h2>
        <p>
          When configured, Tavily searches for retailer promotions and OpenAI extracts terms from
          public source text. These server-side requests use retailer queries and page evidence,
          rather than your bookmarks or personal search text. Supabase may store the shared offer
          cache, report records and rate-limit hashes. Following a source link opens a retailer or
          voucher website with its own privacy practices.
        </p>
      </section>
      <section className="content-section">
        <h2>Your choices and contact</h2>
        <p>
          Installation, sharing and device badges depend on browser support. The app does not enable
          push notifications or background tracking. Use a promotion's report action for incorrect
          terms.
        </p>
        {contactEmail ? (
          <p>
            For privacy requests, contact{" "}
            <a className="content-link" href={`mailto:${contactEmail}`}>
              {contactEmail}
            </a>
            .
          </p>
        ) : (
          <p>
            For a technical issue, visit{" "}
            <a
              className="content-link"
              href="https://github.com/thembaxx/procodiapp/issues"
              rel="noopener noreferrer"
              target="_blank"
            >
              the project issue tracker
            </a>
            . Do not post personal information in a public issue.
          </p>
        )}
      </section>
    </ContentShell>
  );
}
