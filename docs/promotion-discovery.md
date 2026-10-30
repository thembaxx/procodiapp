# Free promotion collection and fallback

**Discover promotions** runs twice daily at `04:17, 16:17 UTC` (06:17 and 18:17 SAST), with manual dispatch on [GitHub Actions](https://github.com/thembaxx/procodiapp/actions/workflows/discovery.yml). Standard runners for this public repository are free. When `GEMINI_API_KEY` is configured, Gemini first tries grounded search, then can prioritize fetched official links if legacy model access is unavailable. Optional Brave/Treg search and the existing official-source collector provide fallbacks. GitHub schedules may be delayed or dropped and can be disabled after 60 days without repository activity.

## Primary search: Gemini free tier

Add **`GEMINI_API_KEY`** as a repository secret or a secret in the GitHub **`discovery`** environment. The workflow passes it only to the collection step. For the deployed app using `PROMOTION_FEED=github`, the key stays in Actions; it does not belong in browser variables or the app build. For local collection, set it server-side in `.env.local`.

The collector first uses **`gemini-2.5-flash`** with **Google Search grounding**, batching all six retailers in one request. Google's [pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash) lists free-tier generation and up to 500 grounded requests per day, shared with Flash-Lite. Generation quotas also apply and may be lower. Use an AI Studio key in a **free-tier project**: the request cannot force free billing on a project with paid billing enabled. Quota/authentication failures do not trigger model retries. The configured Google project determines billing.

If Google returns HTTP 404 for Flash, the collector checks Google's available model list and tries **`gemini-2.5-flash-lite`** only when it supports `generateContent`. Google [states that 2.5 access is limited to previous active users](https://discuss.ai.google.dev/t/gemini-api-models-list-returns-gemini-2-5-flash-with-generatecontent-support-but-generatecontent-returns-404-not-found/184047/2): a listed model does not establish generation access, and creating another key in the same project does not establish eligibility. Fixed HTTP/error codes and stages appear in Actions logs without credentials or provider messages.

If legacy generation still returns 404 after a successful model-list request, **`gemini-3.5-flash-lite`** ranks links from the first configured official source page for each retailer. Pages are fetched through the existing robots, redirect, byte-limit, timeout and anti-bot checks. Blocked or unreadable pages are omitted. One Interactions API request sends bounded public excerpts and up to 25 actual official links per readable store; it sets `store=false`, uses no search/URL-context tools and requests only candidate indices, at most three per store. Returned indices map back to those source links, so the model cannot supply a new URL, coupon or offer. Fetched pages are reused during collection within the existing five-page store budget, including when generation fails. This is **source-page link selection**, not web search: `searched` remains false unless a real search provider succeeds. It cannot discover pages absent from the permitted source links.

Google lists [Gemini 3.5 Flash-Lite generation as free-tier eligible](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite), but its Google Search grounding requires paid-tier access. The fallback does not enable that tool or upgrade billing. There are at most two legacy generation attempts, one model-list read and one current-model generation request on this path. Public excerpts go to Google under the project's applicable data-use terms; no customer reports, saved preferences or credentials are included. `store=false` opts out of retrievable Interactions history and does not override free-tier data-use terms.

Grounded-search responses must include search-grounding metadata. Current-model link selection must be a completed interaction containing valid selection indices. Ungrounded search, blocked, truncated, oversized or malformed responses are discarded. Existing retailer/store allowlists select fetchable URLs. The collector independently reads permitted pages and applies the same evidence, expiry, online-grocery eligibility and freshness rules. Generated codes and snippets never become offers or review evidence. Retailer blocks can still prevent confirmation.

If Gemini is missing, fails, reaches its quota, or its permitted pages yield no confirmed promotion for a retailer, the configured legacy search runs for that retailer. Gemini pages are checked first; fallback URLs take priority in the remaining five-page budget. `DISCOVERY_SEARCH_MODE` selects that fallback (`brave` by default, `treg` or `both` only when explicitly configured). A Treg token alone no longer activates paid search. `none` disables **all** search, including Gemini; user-refresh-triggered scans use this setting to conserve quotas and recheck known sources. The ordinary official-source/CJ paths still run.

After merging, manually run **Discover promotions → main → source: manual** to use the secret immediately; later scheduled full scans use it automatically. Check the resulting feed's per-store `searched` flags and source status. Search success alone never advances the feed timestamp or counts as a confirmed source evaluation. The GitHub secret cannot be read back for local testing.

## Optional Treg Web Access pilot

The scheduled collector can search with [Treg Web Access](https://treg.to/web-access) in
addition to (or instead of) Brave Search when Gemini pages provide no confirmed promotion. The integration requires **a token and explicit opt-in**. No browser token is ever used. Set the following in the GitHub
Actions `discovery` environment:

1. Add secret **`TREG_TOKEN`** (Treg team-scoped token). Identity tokens may
   additionally need the `TREG_ORG` environment variable.
2. Set the Actions variable `DISCOVERY_SEARCH_MODE=treg` or `both` to opt in.
   The latter permits one Treg search and two Brave queries per retailer
   only when Gemini provides no confirmed promotion. The default is `brave`.
   `user_refresh` scans use `none`, so users cannot cause search charges.
3. The workflow sets `TREG_MAX_COST_USD=0.01`,
   `TREG_SCAN_BUDGET_USD=0.12` and `TREG_MAX_CALLS_PER_SCAN=12`.
   These are per-call and **per-run** limits; they are not a durable daily
   budget or a guarantee of monthly cost. Monitor the Treg ledger and set
   an account/org-level budget to prevent repeated workflow runs from
   overspending. Treg waterfall providers can charge even for misses.
4. To enable optional extraction, add the Actions environment variable
   **`PROMOTION_TREG_EXTRACT_FALLBACK=true`**. Extraction is attempted only
   for approved official URLs whose robots policy passed but whose public
   response requires JavaScript and whose Playwright render failed or was
   disabled. The extracted text is treated as **unverified leads only**,
   never as evidence that automatically publishes an offer.

`DISCOVERY_SEARCH_MODE` accepts `none`, `brave`, `treg`, or `both`
in Actions or when running locally. Treg results are passed through the same retailer
allowlists as Brave results: URLs are only discovery hints. A Treg failure,
budget refusal or pending asynchronous response never makes a record live;
the ordinary free public-source collection proceeds. Codes extracted from
Treg are quarantined as `unverified_third_party` candidates until independently
confirmed against retailer evidence.

The Treg client calls `POST https://treg.to/call/treg.web.search` or
`treg.web.extract` with a server-only `X-Treg-Token`, bounded response
size, timeouts and `X-Treg-Route-Max-Cost`. It reads
`X-Treg-Cost-Micro` to report run usage without exposing credentials.
The `treg.web.search` adapter intentionally supports only conservative
common result shapes; confirm the current contract in Treg's catalog
before enabling production billing. No paid live request is performed
by the automated tests.

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
3. Vercel production defaults to the GitHub feed when `PROMOTION_FEED` is unset, so scheduled results reach the app without another configuration step. On other hosts, set `PROMOTION_FEED=github` and redeploy. Explicit `PROMOTION_FEED=local` overrides the production default; previews/local development also default to local. `PROMOTION_FEED_REPOSITORY` defaults to `thembaxx/procodiapp`; change it for a fork. These settings are server-only. The public feed is fetched from a fixed GitHub raw-content origin, validated and cached for at most a minute during normal operation.
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
- To disable Gemini, remove `GEMINI_API_KEY`; existing collection and configured search fallbacks continue. Roll back to the previous application commit if needed, or switch to `PROMOTION_FEED=local` with persistent/shared storage for local collection.

## Optional current-web discovery and rendering

- Set **BRAVE_SEARCH_API_KEY** as an Actions secret in the `discovery` environment to enable the optional fallback after Gemini. Scheduled and manually launched full scans perform at most **two Brave queries per retailer** (12 per run), use shared conservative request pacing, and search both the official retailer site and South African coupon listings. A user-refresh-triggered run **rechecks known sources without search queries** to protect allowances.
- Current search results are used **transiently** to discover URLs, not persisted as search-provider snippets. This is important because Brave may require additional storage rights for storing API responses. Only allowlisted retailer pages and store-specific Wethrift/Picodi pages may be fetched; arbitrary search hits cannot turn into live offers.
- Candidate details from permitted third-party pages remain in `candidates.json` with **unverified_third_party**. Only independently confirmed retailer or eligible CJ evidence may be published to `offers.json`.
- The Actions job sets `PROMOTION_BROWSER_FALLBACK=true`, installs Chromium, and attempts headless Playwright on at most one JavaScript-only official page per store per scan, including failed attempts. After navigation, it waits for network activity to settle, then checks for readable content within the same eight-second limit; early network idle does not end the content wait. A readable snapshot can still be used if background requests prevented idle. Main content must contain at least 100 characters; a header alone does not complete a check. Missing pages, redirects and access challenges are rejected. Pick n Pay prioritizes its public asap! terms for the single render, with the current `/asap-same-day-delivery` page as a later source and the customer-facing retailer link; the retired `/asap` path renders a missing-page response. This is not a CAPTCHA or anti-bot bypass. The Next.js/Vercel app does not enable this fallback.
- Optional on-demand scans require **GITHUB_DISPATCH_TOKEN** as a **server-only** variable on the app deployment. Use a fine-grained token restricted to this repository with **Actions: write**; it is not the Brave key or the Actions job's built-in `GITHUB_TOKEN`. Never use `NEXT_PUBLIC_` for this secret. The refresh response includes `scan.status` (`queued`, `recent`, `cooldown`, `not_configured`, or `failed`). A queued scan does **not** guarantee an offer.
- No new database schema is required. For globally enforced cooldowns on serverless instances, use the already supported Supabase rate-limit storage; local in-memory limits do not synchronize across replicas.

Brave's search credit and limits can change; review your current [API pricing](https://brave.com/search/api/) and [storage rights](https://brave.com/search/api/). A successful search query is not retailer evidence, and no scraping protection is circumvented.
