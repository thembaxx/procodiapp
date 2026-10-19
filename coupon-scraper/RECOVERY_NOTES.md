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

No deployment, production database migration or ProcodiApp runtime integration
has been performed.

## ProcodiApp feed adapter (new)

`src/lib/server/cloudflare-coupon-feed.ts` now fetches a configured
`CLOUDFLARE_COUPON_API_URL` over HTTPS, with an 8-second timeout, Zod
response validation, source-host allowlisting, freshness checks and deduplication.
It returns **review-only leads**. It is not yet called by the discovery
pipeline because the Worker selectors have not been verified and the app
requires evidence and confirmed expiry before publishing an offer.
The adapter is disabled when its environment variable is absent.
