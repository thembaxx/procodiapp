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
  const { contactEmail, operatorName } = siteConfig();
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
        <h2>Who operates Little Less</h2>
        <p>
          {operatorName
            ? `${operatorName} operates this app.`
            : "The app's operator name and private privacy contact are not yet available."}
        </p>
      </section>
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
          To limit abuse, the server derives a secret-keyed identifier from the client address
          supplied by a trusted ingress, or uses a shared bucket when proxy trust is disabled.
          Address identifiers rotate daily. The app does not store raw IP addresses in promotion or
          rate-limit records. Identifiers are pseudonymous, not anonymous. Client/report limits last
          one minute; the shared discovery budget lasts ten minutes. Expired records are deleted
          during the next limiter request or scheduled cleanup.
        </p>
        <p>
          Reports become eligible for deletion after 30 days. The next successful report submission
          or scheduled cleanup removes them from active storage; a stopped scheduler can delay
          deletion. Backups may retain older records under the operator's backup policy. The hosting
          provider processes IP addresses and request logs independently; its retention and
          hosting/database regions have not been verified in this app audit.
        </p>
      </section>
      <section className="content-section">
        <h2>External services</h2>
        <p>
          When configured, Tavily searches for retailer promotions and OpenAI extracts terms from
          public source text. These server-side requests use retailer queries and page evidence,
          rather than your bookmarks or personal search text. Supabase may store the shared offer
          cache, report records and rate-limit hashes. Following a source link opens a retailer or
          voucher website with its own privacy practices. These providers may process data outside
          South Africa; their current terms and the operator's provider arrangements determine the
          locations and retention. Browser searches and bookmarks are not sent to Tavily or OpenAI.
        </p>
      </section>
      <section className="content-section">
        <h2>Your choices and contact</h2>
        <p>
          Installation, sharing and device badges depend on browser support. The app does not enable
          push notifications or background tracking. Use a promotion's report action for incorrect
          terms.
        </p>
        <p>
          For a report-deletion request, provide only its promotion ID, selected reason and
          approximate submission time through a private contact. Without an account, the app cannot
          reliably associate a report with a particular person. Do not send payment details or
          identity documents.
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
            A private privacy contact is not yet available. Do not use a public issue for privacy
            requests. For a technical issue, visit{" "}
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
