# Recovery status — 19 October 2026

Recovered and committed a Worker scaffold from the pasted conversation:

- `src/index.ts`: 11 retailers, twice-daily cron, queue fan-out/consumer,
  public read API and authenticated manual enqueue, parser and D1 persistence
- `src/puppeteer-scraper.ts`: browser session scraping
- `src/types.ts`, `schema.sql`, `wrangler.jsonc`, `package.json`,
  `tsconfig.json` and `README.md`

This is reconstructed code, **not an exported or tested original**.

## Fixes made relative to transcript

- Cloudflare Quick Actions need compatibility date >= 2026-03-24; use 2026-10-13.
- Browser binding configured as an object.
- `POST /api/scrape` rejects requests if API_KEY is missing.
- D1 schema uses CREATE TABLE IF NOT EXISTS instead of DROP TABLE.
- Active expiry query handles ISO date-only values; relative expiry strings are ignored.
- Quick Action response status and shape are checked; server exceptions are not sent to clients.
- Root ProcodiApp retains pnpm; Worker is an independently managed npm package.

## Blockers before production

1. Run `npm install`, `npm run typecheck` and tests against real Wrangler versions.
2. Confirm `@cloudflare/puppeteer` and Wrangler versions resolve and their types match.
3. Check current account quotas; twice daily is not proof of zero cost.
4. Confirm live retailer URL, selector, robots/terms and permission individually.
5. Add fixture tests for parsing, deduplication, auth, expiry, and queue retry.
6. Supply existing D1 ID, create/reuse queues, set API_KEY via Wrangler secret.
7. Deploy to staging and inspect real scrape output before publishing as verified offers.
8. Implement ProcodiApp's Cloudflare-primary adapter and retain its existing
   Gemini/official-site/legacy fallbacks. The app's existing discovery pipeline
   has been inspected but has not yet been changed.

The initial recovery did not deploy or migrate the Worker. See the deployment
follow-up below for the current status. ProcodiApp runtime integration remains
outside this Worker deployment.

## Deployment follow-up — 19 October 2026

- Cloned the repository in a network-enabled environment and installed the Worker dependencies.
- Replaced the unpublished `@cloudflare/workers-types@^4.20261001.0` requirement
  with the published `^5.20261019.1` release and added an npm lockfile.
- Fixed the handler declaration to `ExportedHandler<Env, ScrapeJob>` so the queue
  payload type passes the current Workers type definitions.
- Type checking, all six existing tests and the Wrangler deployment dry-run passed.
- Uploaded the Wrangler bundle using the authenticated Cloudflare connection;
  the shell did not have Wrangler credentials. Cloudflare accepted the Worker
  with `fetch`, `scheduled`, and `queue` handlers.
- Deployed URL: `https://coupon-scraper.mndebele-themba.workers.dev`.
- Set `API_KEY` as a secret, then applied the non-destructive schema and connected
  `scrape-jobs` to the Worker with `scrape-dlq` as its dead-letter queue.
- Verified the 00:00/12:00 UTC schedule, health/coupon responses (200), rejected
  missing/invalid keys (401), and authenticated enqueueing of all 34 jobs (202).
- Live logs showed empty extraction results and Browser Run 422/429 errors;
  no coupons were stored in the initial run. Added a 60-second queue retry delay
  to prevent immediate repeated requests. The retailer selectors and sustained
  Browser Run throughput still need verification before publishing offers.

## ProcodiApp feed adapter (new)

`src/lib/server/cloudflare-coupon-feed.ts` now fetches a configured
`CLOUDFLARE_COUPON_API_URL` over HTTPS, with an 8-second timeout, Zod
response validation, source-host allowlisting, freshness checks and deduplication.
It returns **review-only leads**. It is not yet called by the discovery
pipeline because the Worker selectors have not been verified and the app
requires evidence and confirmed expiry before publishing an offer.
The adapter is disabled when its environment variable is absent.
