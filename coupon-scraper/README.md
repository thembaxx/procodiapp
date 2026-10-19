# Coupon scraper (reconstructed)

A Cloudflare Worker that schedules and queues discovery for 34 configured South African retailer targets.
The recovered source is a **staging scaffold**, not a verified production feed.

## Architecture

Cron (00:00 and 12:00 UTC / 02:00 and 14:00 SAST) or authenticated POST
→ up to 34 jobs on scrape-jobs → up to 3 queue consumers → Browser Run Puppeteer
or scrape Quick Action → deduplicated D1 coupons → GET /api/coupons.

## Setup

From `coupon-scraper/`:

1. `npm ci` (this folder has its own npm lockfile).
2. `npx wrangler d1 create coupons` if it does not already exist; copy its actual database ID into wrangler.jsonc.
3. `npm run queue:create` (only if the queues do not exist).
4. `npm run typecheck && npm test && npm run build` to check types, tests and the deployable bundle.
5. `npm run deploy` with Cloudflare credentials for the account in `wrangler.jsonc`.
6. `npx wrangler secret put API_KEY` (mandatory for POST /api/scrape).
7. Check existing production data, then `npm run db:migrate` before reading coupons or triggering scraping. The schema preserves existing tables and rows.
8. Test `GET /api/health`, `GET /api/coupons`, and authenticated `POST /api/scrape` at the deployed URL. Missing or invalid keys must return 401.
9. Validate each target's URL, CSS selectors and output before publishing offers. `npm run dev` uses remote mode for Quick Actions.

`npm run deploy` automatically runs type checking and tests first. The queue retries
failed jobs after 60 seconds instead of immediately repeating rate-limited calls;
it still sends jobs to `scrape-dlq` after two retries.

## Current deployment

Deployed on 19 October 2026:
`https://coupon-scraper.mndebele-themba.workers.dev`.
The Browser Run, existing D1 and queue bindings, queue consumer, and twice-daily
cron were verified through Cloudflare. `API_KEY` is configured as a Worker secret.
The schema was applied after the Worker was deployed.

Live checks returned 200 for health and coupons, 401 for missing/invalid keys,
and 202 with 34 enqueued jobs for an authenticated scrape. The first run stored
no coupons: logs showed empty extraction results and Browser Run 422/429 errors.
Deployment and enqueueing work; retailer extraction remains unverified. Review
Browser Run usage and failed jobs before replaying the dead-letter queue.

## API

- `GET /api/health`
- `GET /api/coupons?merchant=Pick%20n%20Pay&active=true&limit=100`
- `GET /api/coupons/:id`
- `POST /api/scrape` with `Authorization: Bearer <API_KEY>` (returns 202 when queued)

The API intentionally does not claim that every extracted discount is a validated coupon.
Source selectors are hypotheses and need site-by-site verification. Comply with site terms,
robots directives and applicable rate limits. Do not bypass bot challenges.

## Known limitations

- Live scraping has been triggered, but no retailer extraction has been verified.
- The D1 ID and account ID are configured for the connected Cloudflare account; change both when deploying to another account.
- Quick Actions require a compatibility date >= 2026-03-24 and remote development.
- This folder uses npm independently; the ProcodiApp root continues to use pnpm.
- Cloudflare plan quotas and costs must be checked on the connected account.
- Production ProcodiApp integration and fallback behaviour are not yet wired.

## Retailer selection

The supplied 11 original + 23 additional entries total **34**, not 33. None of the
new selectors or retailer deal URLs have been live verified.

Set `ENABLED_MERCHANTS` as a comma-separated **server-wide** Worker environment
variable (e.g. `Checkers,SPAR,Makro`) to queue only those retailers. The queue
consumer also rejects disabled jobs left over from earlier schedules.
If unset, only Pick n Pay, ShopRite, Clicks, Checkers, SPAR and Makro are enabled by default while the rest remain unverified. Set the variable explicitly to opt into more retailers. This is not a per-user setting.

ProcodiApp's My Stores UI saves per-device selection and order, but it does not
control the shared scheduled Worker. A per-user scraping contract requires user
accounts, persisted selection, and tenant-scoped queue jobs; do not treat local
storage as a server-side permission or scheduling mechanism.

The app now hides manual refresh, offers horizontally scrolling category pills,
and supports an optional region label on verified offers. Official logo/font
assets have not been verified or licensed for the new brands.

## Reviewed publication and resilient integration

`/api/coupons` is a **candidate feed**, not published retail savings. Browser guesses,
uncertain expiry and unvalidated retailer pages must never go directly to ProcodiApp.

1. Apply the **additive**, idempotent `schema.sql` with `npm run db:migrate` before deploying the updated Worker. It adds `verified_offers` and `source_health` without removing existing coupons.
2. `GET /api/source-health` shows status per merchant, last scan, consecutive failures, and extracted candidate counts. Two consecutive scan errors begin a progressive cooldown (up to six hours) to protect Browser Run quota.
3. `POST /api/review` requires `Authorization: Bearer <API_KEY>`. Only reviewed first-party evidence can be inserted. It requires canonical merchant + store ID, a specific official HTTPS URL, substantial source evidence, eligibility, channel, offer kind, and valid expiry (or explicitly ongoing status). Publication is limited to the next 24 hours or the earlier stated expiry. No AI inference or scraper auto-approval.
4. `GET /api/verified-offers` returns only reviewed unexpired records. This is the **only** new endpoint eligible for integration into ProcodiApp. An empty verified feed is legitimate.
5. Set `CLOUDFLARE_VERIFIED_FEED_URL=https://coupon-scraper.mndebele-themba.workers.dev/` in ProcodiApp's server environment only after verifying the Worker deployment and D1 migration. The live app merges qualifying reviewed offers with its GitHub feed; a failure does not renew old deadlines. If GitHub fails and reviewed Worker offers remain fresh, those can serve as a limited standalone fallback.

The Worker's review endpoint records evidence supplied by an operator; it cannot
prove the operator's evidence is current without an independent recheck.
Offers are labelled **source listed, not tested at checkout**. A future reviewed
checkout-testing process must be distinct from retailer-source confirmation.
Some retailer hosts intentionally remain unsupported by the six-store web UI;
the 34-store preference catalogue is not evidence of live catalogue coverage.

`GET /api/source-health` and the app's `/status` page are public operational
summaries; no secrets, report details or private rate-limit identifiers are returned.

### Expansion sequence

Prioritize separately reviewed official retailer catalogue URLs (Pick n Pay,
Checkers and Clicks), structured partner feeds where contracts allow reuse,
and then additional store sources. Discovery-search snippets, Guzzle-like
aggregator claims and third-party coupon pages are **leads** until licensing
and primary-source validation are in place. Do not bypass robots/CAPTCHA.
