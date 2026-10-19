# Codex Prompt — Cloudflare Queues scraper integration

## Goal

Integrate the separately hosted coupon-scraper Cloudflare Worker into ProcodiApp as the primary promotion source, retaining Gemini-grounded search, official-site collection, PDFs, and existing legacy search as fallbacks. The Cloudflare source repository is not yet available in this GitHub repository; obtain its actual source before editing Worker implementation. Do not assume this document constitutes the Worker source.

## Worker changes (apply to the actual coupon-scraper repository)

- In wrangler.jsonc configure browser binding BROWSER, D1 binding DB (actual database ID, never a placeholder in deployed config), cron `0 */12 * * *`, producer binding SCRAPE_QUEUE to `scrape-jobs`, consumer with `max_batch_size: 1`, `max_batch_timeout: 1`, `max_concurrency: 3`, `max_retries: 2`, and `dead_letter_queue: scrape-dlq`.
- In src/types.ts add `export interface ScrapeJob { index: number }`.
- In src/index.ts add `SCRAPE_QUEUE: Queue<ScrapeJob>` to Env; scheduled handler enqueues one job per existing SCRAPE_TARGETS entry; queue consumer resolves index, calls existing scrapeTarget and storeCoupons, acknowledges success, retries failures. Invalid indices are acknowledged and logged.
- POST /api/scrape should authenticate and enqueue, returning `{ok:true,enqueued}` rather than running sequentially. Remove obsolete sequential cycle only after verifying no other callers.
- In package.json add `"queue:create": "wrangler queues create scrape-jobs && wrangler queues create scrape-dlq"`.
- Update Worker README with Queue fan-out, cron at 00:00 and 12:00 UTC (02:00 and 14:00 SAST), and queue setup.
- Preserve src/puppeteer-scraper.ts, schema.sql, tsconfig.json, SCRAPE_TARGETS, scrapeTarget, parseCouponText, deterministicId, storeCoupons.
- Store API_KEY as a Wrangler secret; do not use empty or plaintext vars as authentication bypass. Restrict POST /api/scrape to authorized requests, including when no secret is configured (fail closed).
- Use a stable target identifier instead of array index if targets may be reordered while messages are in flight. Ensure partial enqueue failures are surfaced; prevent duplicate overlapping scrape cycles; avoid retry storms and excessive browser usage.
- Verify Cloudflare plan limits and actual supported Browser Rendering API before deployment; do not assume 10 min/day or $0/month without measurement.

## ProcodiApp changes

- Inspect existing discovery pipeline and data model before changes; use pnpm, not npm, for ProcodiApp.
- Add server-only Cloudflare coupons adapter with configured base URL and timeout, strict Zod validation, provenance, expiration checks, retailer mapping and canonical URL validation.
- Primary: Cloudflare API. On unavailable/stale/invalid/insufficient data, run existing Gemini, official-site collection and optional Brave/legacy search fallback without dropping valid primary results.
- Deduplicate by stable merchant, offer identity, canonical source and validity dates. Never publish unsupported coupon codes or scraped text without primary-source validation. Avoid making the browser API key public.
- Provide observability for primary/fallback decisions, freshness, retries, and source failures. Add unit/integration tests for primary success, empty/stale response, timeout, 401, malformed payload, duplicate offers and fallback recovery.
- Maintain existing UX and offline freshness rules. Document deployment configuration and rollback toggle.

## Deployment order

1. Obtain and inspect the real coupon-scraper Worker repository.
2. Install dependencies, create/reuse D1, create Queues, apply schema, configure secrets, test locally, deploy Worker.
3. Verify actual API response and source accuracy; integrate ProcodiApp and run pnpm checks.
4. Deploy preview, verify live coupon discovery, then promote only after approval.
