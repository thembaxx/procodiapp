# Free promotion collection and fallback

**Discover promotions** runs twice daily at `04:17, 16:17 UTC` (06:17 and 18:17 SAST), with manual dispatch on [GitHub Actions](https://github.com/thembaxx/procodiapp/actions/workflows/discovery.yml). Standard runners for this public repository are free. The collector uses no AI models. It can optionally use Brave Search (within your plan's allowance) to discover additional official retailer pages and pre-approved coupon-review pages. GitHub schedules may be delayed or dropped and can be disabled after 60 days without repository activity.

## Primary collection

The worker fetches approved official sources for the six South African grocery retailers, reads robots policies, and parses HTML promotion blocks, declarative JSON-LD, and text PDFs. Optional Brave Search identifies more approved URLs, and a bounded Playwright fallback renders allowed JavaScript-only pages on GitHub Actions. Authentication, CAPTCHA, blocks and disallowed robots paths are never bypassed. Reviewed benefit evidence is checked without cutting away the end of long terms pages. Approved campaign/terms links share a five-page budget per store. Source requests reject redirects, retain byte/time limits, and never bypass login or CAPTCHA.

Only dated offers with source-listed codes and online grocery eligibility become live offers. The country, shopping channel, basket requirement, first-order limits and exclusions matter. Source-listed is not tested at checkout. A reviewed recurring membership benefit can have no listed end date; it still expires from the app after 24 hours without confirmation.

Permitted Wethrift/Picodi retailer-specific pages supply **review leads only**. Pick n Pay Wethrift can also use its embedded public JSON. Retired entries are excluded. Scores and posting dates do not establish expiry. Picodi and Wethrift SPAR are not automatic publication sources.

## Optional second path: CJ Affiliate

The fallback uses CJ's documented [Link Search API](https://developers.cj.com/docs/rest-apis/link-search). [Publisher signup is free](https://www.cj.com/support); the user must have an approved property and participating South African advertiser programmes. This repository does not assume that all six stores are in CJ.

Configure these in the GitHub `discovery` environment or repository:

- Secret `CJ_API_TOKEN`: a publisher personal access token.
- Variable `CJ_WEBSITE_ID`: the numeric property/PID registered with that token.
- Variable `CJ_ADVERTISERS`: JSON mapping store IDs to approved advertiser ID strings, such as `{"pnp":["12345"]}`. The example ID is illustrative; select the real South African programme IDs from your account.

Leave all three unset to run only primary collection. A partially configured fallback fails explicitly. CJ is queried for a store only when official checks fail or produce no eligible coupon code. No fallback subscription is installed.

The adapter requires `joined` status, a configured advertiser ID, explicit `ZA` targeting, an approved official merchant destination, online grocery terms, and valid promotion dates. It never follows affiliate tracking redirects. CJ timestamps documented as UTC keep UTC; retailer date-only expiry ends at 23:59:59.999 SAST. Responses have a bounded three-page budget; a truncated or failed response cannot remove prior affiliate listings. Credentials go only to the fixed CJ endpoint and are never included in the public feed or logs.

## Activate the GitHub feed

1. Merge the implementation onto `main`, then manually run **Discover promotions → main**. The trusted-main job uses its scoped `GITHUB_TOKEN` to create/update the separate `promotion-data` branch. The primary collector needs no manually configured API or database secret.
2. Confirm the job succeeds and the branch contains `offers.json` and `candidates.json`. Publication only occurs after at least one official source or configured CJ source completes. Zero coupons is a valid result; total source failure fails the job and leaves the published branch unchanged.
3. Set `PROMOTION_FEED=github` on the app and redeploy. `PROMOTION_FEED_REPOSITORY` defaults to `thembaxx/procodiapp`; change it for a fork. This setting is server-only. The public feed is fetched from a fixed GitHub raw-content origin, validated and cached for at most a minute during normal operation.
4. Check `/api/offers`: `mode` is `free_sources`, with a real `updatedAt`, `parsedPages` and per-store `fallback` status. Refresh immediately reads the latest feed. If `GITHUB_DISPATCH_TOKEN` is configured server-side, it may also queue an asynchronous Actions scan (only if the existing feed is at least ten minutes old, with a shared ten-minute cooldown). The browser never crawls websites and new results appear after publication, not immediately. An old feed or failed scan is not reported as fresh. Existing offline expiry checks remain active.

The publisher loads the previous feed so failed sources retain still-fresh prior listings with their original deadlines. Successful source evaluations remove unconfirmed prior listings. Expired/stale offers are pruned. Publication is a non-force update and concurrency prevents overlapping jobs. The data branch does not rebuild the application on each scan.

The app's private reports and rate limits still need a persistent local directory for one Node instance, or the existing Supabase storage for serverless/multiple instances. GitHub offer publication does not replace those private records. If the existing Supabase URL and service-role key are configured as Actions secrets, optional private cleanup runs after the collection/publication steps, even when they fail. Otherwise local report retention runs on writes. No SQL migration is needed.

## Review incomplete coupons

Inspect `candidates.json` on the data branch. Candidates are never returned as live offers. Reasons include missing expiry, unclear eligibility and foreign region. A reviewer must find supporting public retailer terms; review cannot invent an end date or make a foreign campaign South African.

Add a qualifying dated record to `data/reviewed-promotions.json` through a reviewed PR. Each record contains `storeId`, approved official `sourceUrl`, `code` (or null), `title`, `criteriaEvidence`, `expiresAt`, `expiryEvidence` and `codeEvidence` (or null). Evidence fields are exact source quotes. `expiryEvidence` needs an explicit date phrase such as “Expires on 31 December 2026.” At every scan, all evidence must still exist in the source, the expiry must match, and the criteria must support online groceries. Do not put personal, single-use or account-specific vouchers in the repository.

## Local or shared-database collection

Keep `PROMOTION_FEED=local` and run `pnpm discover`. It uses existing persistent file storage or Supabase and the same source/fallback adapters as Refresh and authenticated `/api/cron`. Keep the existing production rate-limit secret and storage requirements. CJ settings, if wanted in this mode, belong only on the server.

For a filesystem publication trial, use `DATA_DIR=/absolute/output/path PROMOTION_FEED=local pnpm discover --publish`. This writes `offers.json` and a separate review file without requiring model, search, or database keys. A GitHub runner without publication or shared storage is rejected because its filesystem is temporary.

## Operational checks

- Monitor failed jobs, unavailable stores, and `updatedAt` older than 24 hours. A successful fetch does not guarantee a working coupon.
- Keep source URLs and parsers current. Primary pages can be blocked, use JavaScript, change layout, or only advertise in-store specials. CJ coverage remains account-specific.
- Keep Actions artifacts/cache within their free allowances. No scraping proxy, hosted model or paid-search dependency is required.
- Roll back to the previous application commit if needed; switch back to `PROMOTION_FEED=local` with persistent/shared storage to use local collection. The old AI settings are ignored by the new collector.

## Optional current-web discovery and rendering

- Set **BRAVE_SEARCH_API_KEY** as an Actions secret in the `discovery` environment. Search remains disabled without it. Scheduled and manually launched full scans perform at most **two queries per retailer** (12 per run), use shared conservative request pacing, and search both the official retailer site and South African coupon listings. A user-refresh-triggered run **rechecks known sources without Brave queries** to protect the monthly free search credit.
- Current search results are used **transiently** to discover URLs, not persisted as search-provider snippets. This is important because Brave may require additional storage rights for storing API responses. Only allowlisted retailer pages and store-specific Wethrift/Picodi pages may be fetched; arbitrary search hits cannot turn into live offers.
- Candidate details from permitted third-party pages remain in `candidates.json` with **unverified_third_party**. Only independently confirmed retailer or eligible CJ evidence may be published to `offers.json`.
- The Actions job sets `PROMOTION_BROWSER_FALLBACK=true`, installs Chromium, and runs headless Playwright for up to one JavaScript-only official page per store per scan. This is not a CAPTCHA or anti-bot bypass. The Next.js/Vercel app does not enable this fallback.
- Optional on-demand scans require **GITHUB_DISPATCH_TOKEN** as a **server-only** variable on the app deployment. Use a fine-grained token restricted to this repository with **Actions: write**; it is not the Brave key or the Actions job's built-in `GITHUB_TOKEN`. Never use `NEXT_PUBLIC_` for this secret. The refresh response includes `scan.status` (`queued`, `recent`, `cooldown`, `not_configured`, or `failed`). A queued scan does **not** guarantee an offer.
- No new database schema is required. For globally enforced cooldowns on serverless instances, use the already supported Supabase rate-limit storage; local in-memory limits do not synchronize across replicas.

Brave's search credit and limits can change; review your current [API pricing](https://brave.com/search/api/) and [storage rights](https://brave.com/search/api/). A successful search query is not retailer evidence, and no scraping protection is circumvented.
