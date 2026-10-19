# Coupon scraper (reconstructed)

A Cloudflare Worker that schedules and queues discovery for 34 configured South African retailer targets.
The recovered source is a **staging scaffold**, not a verified production feed.

## Architecture

Cron (00:00 and 12:00 UTC / 02:00 and 14:00 SAST) or authenticated POST
→ up to 34 jobs on scrape-jobs → up to 3 queue consumers → Browser Run Puppeteer
or scrape Quick Action → deduplicated D1 coupons → GET /api/coupons.

## Setup

From `coupon-scraper/`:

1. `npm install`
2. `npx wrangler d1 create coupons` if it does not already exist; copy its actual database ID into wrangler.jsonc.
3. `npm run queue:create` (only if the queues do not exist).
4. `npm run db:migrate:local`; check schema and existing production data before `npm run db:migrate`.
5. `npx wrangler secret put API_KEY` (mandatory for POST /api/scrape).
6. `npm run typecheck && npm test`; `npm run dev` (remote mode needed for Quick Actions).
7. Validate each target's permissions, URL, CSS selectors and output on staging.
8. `npm run deploy` only after successful checks.

## API

- `GET /api/health`
- `GET /api/coupons?merchant=Pick%20n%20Pay&active=true&limit=100`
- `GET /api/coupons/:id`
- `POST /api/scrape` with `Authorization: Bearer <API_KEY>` (returns 202 when queued)

The API intentionally does not claim that every extracted discount is a validated coupon.
Source selectors are hypotheses and need site-by-site verification. Comply with site terms,
robots directives and applicable rate limits. Do not bypass bot challenges.

## Known limitations

- No live retailer extraction or integration tests have been run.
- D1 database ID is a placeholder and must be configured.
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
If unset, all 34 are enabled. This is not a per-user setting.

ProcodiApp's My Stores UI saves per-device selection and order, but it does not
control the shared scheduled Worker. A per-user scraping contract requires user
accounts, persisted selection, and tenant-scoped queue jobs; do not treat local
storage as a server-side permission or scheduling mechanism.

The app now hides manual refresh, offers horizontally scrolling category pills,
and supports an optional region label on verified offers. Official logo/font
assets have not been verified or licensed for the new brands.
