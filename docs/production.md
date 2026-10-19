# Production launch

The repository includes application code, tests and deployment assets. A public launch still needs a real HTTPS domain, hosting, persistent storage, an operator contact and a working discovery schedule. The repository lists `https://procodiapp.vercel.app` as its homepage. This change does not provision hosting, configure provider credentials or modify deployment secrets.

## Configure the deployment

Set these server environment variables before public launch:

| Variable                                          | Requirement                                                                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `SITE_URL`                                        | The canonical public HTTPS origin, with no subpath, credentials, query or fragment. Do not use a preview hostname.                       |
| `INDEXING_ENABLED`                                | `true` on the public production deployment; `false` on previews and staging.                                                             |
| `OPERATOR_NAME`                                   | The real operator/responsible party displayed on the privacy page.                                                                       |
| `RATE_LIMIT_SECRET`                               | A separate random server-only secret of at least 32 characters, identical across replicas. Required for keyed rate limits in production. |
| `CONTACT_EMAIL`                                   | The operator's support/privacy email, displayed on the privacy page.                                                                     |
| `CRON_SECRET`                                     | Optional for the alternative HTTP scheduler: use 32+ random characters. The GitHub feed publisher does not need it.                      |
| `DATA_DIR`                                        | An absolute path on a persistent volume for exactly one Node instance. Docker defaults to `/app/.data`; mount it.                        |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`       | Use instead of local storage for multiple instances or serverless. Run `supabase/schema.sql` first. Credentials are server-only.         |
| `CLOUDFLARE_VERIFIED_FEED_URL`                  | Optional verified-offer Worker HTTPS origin. Enable only after applying the new D1 migration and validating Worker endpoints; unverified coupons never publish. |
| `PROMOTION_FEED`, `PROMOTION_FEED_REPOSITORY`     | Use `github` after the scheduled feed is published; `local` runs collection against persistent/shared storage.                           |
| `BRAVE_SEARCH_API_KEY`                            | Optional Actions-only web discovery key. Do not expose it to the browser.                                                                |
| `GITHUB_DISPATCH_TOKEN`                           | Optional server-only fine-grained Actions-write token for on-demand scans in GitHub feed mode.                                           |
| `PROMOTION_BROWSER_FALLBACK`                      | Enable only in the Actions collector with installed Chromium; keep disabled in the deployed app.                                         |
| `CJ_API_TOKEN`, `CJ_WEBSITE_ID`, `CJ_ADVERTISERS` | Optional free publisher fallback. Set together on the collector only; leave unset for credential-free official sources.                  |
| `TRUST_PROXY`                                     | Enable only when a trusted ingress overwrites `x-forwarded-for`.                                                                         |

Metadata for public pages, robots and sitemap use runtime configuration. The static offline shell is always excluded from indexing. Set the same public configuration during build and runtime when possible, and rebuild after changing branding or metadata defaults. Never put provider keys into `NEXT_PUBLIC_*` variables or the container image.

```sh
pnpm check:production
pnpm check
pnpm audit --prod
pnpm build
pnpm start
```

`check:production` reports missing or inconsistent configuration without printing credentials. A successful check does not validate provider access, volume persistence, DNS, TLS or your ingress configuration. Primary collection requires no search or model key. Live source reachability and optional authenticated CJ access still need verification; fixtures do not establish retailer coverage or checkout validity.

## Verify the running host

1. Use a managed HTTPS ingress with HTTP-to-HTTPS redirection, connection/request deadlines and request-body limits. Forward the original host correctly and overwrite forwarding headers before trusting them. The app recognises its configured canonical origin behind an internal host.
2. Check `GET /api/health`. It returns `200 {"status":"ready"}` when storage is accessible and `503` when unavailable. It exposes no environment variables, paths or credentials. This is storage readiness, not proof of fresh offers or working external providers.
3. Run [scheduled collection](promotion-discovery.md) on main and confirm the `promotion-data` branch. Vercel production reads it by default when `PROMOTION_FEED` is unset; other hosts need `PROMOTION_FEED=github` and a redeploy. It runs twice daily; `GEMINI_API_KEY` enables primary Gemini search, with optional legacy search fallbacks. Verify `/api/offers` mode, successful timestamp and per-store parsed/fallback checks. Provider secrets belong on Actions. Authenticated `/api/cron` remains an alternative for a persistent local/shared-database collector.
4. Restart/redeploy and verify the cache and reports survive. Back up the volume/database and rehearse restoration. Do not scale local-file storage across processes or replicas.
5. Check the live canonical, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/promotions.md` and `/share-image`. Canonicals must use the public domain, with no `localhost`, preview host or query variants. Submit the sitemap through Google Search Console and Bing Webmaster Tools using your own verified accounts.
6. Install from the actual HTTPS origin on iOS and Android. Check the Ready offline state, close/reopen offline, reconnect and accept an app update. An app manifest check cannot substitute for actual device installation.
7. Monitor API failures, storage readiness, scheduled discovery and offer freshness. Alert on repeated scheduler failures, repeated unavailable source checks or an `updatedAt` older than 24 hours; an empty offer list alone is not an outage. Retailers can deny access even when providers are correctly configured.

## Crawl and AI discovery behavior

Public pages include unique titles/descriptions, clean canonical URLs, Open Graph/Twitter previews, a crawlable store directory, six retailer pages, source-method information and privacy information. Store pages render complete qualifying terms and review timestamps without JavaScript. They use the same expiry/freshness rules as the app and retain useful guidance when no offer is confirmed.

The sitemap lists only the ten canonical HTML pages. It omits invented modification times, query variants, APIs and the offline shell. Indexing requires a valid production origin and an enabled indexing setting. Set `SITE_URL` and `INDEXING_ENABLED=true` on your host. Vercel can use its injected stable `VERCEL_PROJECT_PRODUCTION_URL` and defaults indexing on only when `VERCEL_ENV=production`; explicit settings override these defaults. `VERCEL_URL` is never used because it can be a temporary preview hostname. Otherwise the sitemap is empty, pages use `noindex` and robots disallows crawling. Robots rules are discovery guidance, not access control.

Structured data describes the website, free web application and store breadcrumbs. It does not invent ratings, prices, an organisation identity or checkout guarantees. Do not add Product/Offer markup to membership benefits without real price and eligibility evidence matching visible page content.

`/llms.txt` is a discovery hint that links to source policy, store pages and request-time Markdown listings. `/promotions.md` is not cached and excludes expired, stale and unknown-expiry offers. Each record includes criteria, source, checkout status, published expiry and review-valid-until. It is kept out of search indexes to avoid duplicating HTML pages. Search and answer engines primarily rely on accessible HTML and their own policies; this file does not guarantee inclusion or ranking. Do not use expired cached feed content to make savings claims.

Source-specific extraction uses declarative JSON/HTML, text PDFs and reviewed evidence, with byte limits, a five-page store budget and a 90-second overall scan deadline. The Actions runner can optionally render one permitted JavaScript-only page per store with Playwright; the Vercel app should not launch a browser. The optional CJ adapter rejects unjoined, foreign, malformed or undated offers. Incomplete leads remain in a separate review file. When `GEMINI_API_KEY` is configured, one Gemini 2.5 Flash grounded request discovers URLs before legacy search and page checks; use a free-tier Google project. Generated claims are never publication evidence. Treg search requires explicit opt-in; user-refresh scans disable all search. See [provider setup](promotion-discovery.md). Source evidence is not proof of checkout eligibility.

## Security, privacy and operations

API responses are `no-store` and excluded from indexing. Browser refresh/report requests reject foreign origins and cross-site fetch metadata. Reports enforce a 2KB byte limit even without `Content-Length`, a five-second body deadline, strict enumerated fields, and safe errors. Unknown fields, such as accidental personal text, are rejected. Client/report limits are one minute; a stable shared budget permits public discovery at most once per ten minutes. Keyed HMAC address identifiers rotate daily; the Supabase limiter fails closed on invalid responses. The cron endpoint uses timing-safe secret comparison and returns 503 when every source is unavailable, so schedulers can detect an unsuccessful check. Source URLs must be HTTPS, with no embedded credentials, and match an explicitly reviewed retailer/voucher host; unlisted subdomains are rejected. Source redirects are not followed. Provider and database requests also reject redirects, validate bounded responses and retain timeouts. Stored cache records are projected through a public schema; malformed records fail closed.

The app ships HSTS for HTTPS hosts, framing protection, restrictive browser permissions and a CSP limiting assets/connections to the app. Inline scripts/styles remain allowed because Next's streamed hydration, the pre-paint appearance script and the static offline shell need them. This policy is not a nonce-based XSS guarantee. Inline event attributes are blocked with `script-src-attr none`; frames and media are disallowed. Production disallows `unsafe-eval` and Zod uses interpreted validation; escaped JSON-LD and React escaping protect generated source content. Re-test offline launch before adopting a nonce policy: per-request nonces are incompatible with simply replaying a static cached shell.

The app has no accounts, ad cookies or analytics trackers. Saved preferences/bookmarks and offline snapshots stay on the device. Reports contain a promotion ID, enumerated reason and time; rate-limit records use secret-keyed identifiers rather than raw addresses. Identifiers are pseudonymous; address identifiers rotate daily and expired limiter rows are removed at the next limiter request or scheduled cleanup. Hosting logs, Supabase, optional affiliate feeds and public source links have their own privacy implications.

Before public launch, review the privacy page against the actual hosting region, log retention and service-provider arrangements, provide the real operator identity/private contact and document processor contracts, cross-border transfers and backup retention. Reports are eligible for deletion after 30 days; the next successful report submission or scheduled cleanup deletes them from active storage. Cleanup runs before authenticated scheduled discovery, even if sources subsequently fail. A stopped scheduler can delay deletion; backup deletion remains an operator responsibility. These safeguards do not establish POPIA compliance. Review reports through the private database/file and correct inaccurate listings. There is no admin dashboard.

The dependency audit is a point-in-time check. Keep dependencies updated and run the full CI suite on each release. Test rollback of the server and preserve the previous static build assets for older tabs. Re-run accessibility and performance checks on real devices and collect Core Web Vitals only after choosing and documenting a privacy-appropriate measurement setup.

## Apply the privacy/security migration

Before enabling refresh/report writes, set a strong `RATE_LIMIT_SECRET`, run the current `supabase/schema.sql` in the actual project and redeploy. It is a transactional, repeatable migration that replaces the limiter RPC with the `(client_key, window_seconds)` signature and adds service-role-only report/cleanup RPCs. It deletes reports older than 30 days and expired limiter rows as part of the migration. Back up and verify the intended database before applying it. Local storage needs exactly one process; report compaction is serialized within that process and uses private atomic files.

Check `pnpm check:production`, `/api/health`, a real report, one refresh plus its rate-limit response, and one scheduled cleanup. SQL tests run against an isolated PostgreSQL service in CI. For a local isolated PostgreSQL container, run `DATABASE_CONTAINER=<test-container> pnpm test:database`; never point this fixture runner at production. It creates test roles and rows.

The [privacy and security audit](security-audit.md) lists evidence, fixes, remaining launch blockers and controls that could not be inspected. In particular, configure edge request/connection limits and source request limits; application rate limits do not prevent volumetric traffic or enforce hosting/storage quotas.

Optional on-demand GitHub Actions dispatch needs a dedicated server-only fine-grained token with Actions write access. The existing rate-limit storage should be Supabase on multi-instance Vercel deployments. A user refresh immediately returns the current feed, with an additional `scan.status` field indicating whether a background run was queued.
