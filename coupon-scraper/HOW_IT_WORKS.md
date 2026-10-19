# How the Cloudflare coupon-scraper fits ProcodiApp

## Proposed architecture
```text
Cloudflare cron (00:00 and 12:00 UTC)
  -> Queue producer (one message per retailer)
  -> scrape-jobs (up to three concurrent consumers)
  -> Browser Rendering / supported page retrieval
  -> D1 coupons
  -> GET /api/coupons?active=true
  -> ProcodiApp server-side Cloudflare adapter
       -> validate, filter, normalize, deduplicate
       -> fall back to existing Gemini/official HTML/PDF/Brave providers when needed
       -> existing promotions UI and offline cache
```

## Worker API described by source handoff
- GET /api/health: health
- GET /api/coupons: optional merchant, active, limit
- GET /api/coupons/:id: single coupon
- POST /api/scrape: authenticated manual enqueue; returns `{ok:true,enqueued}`

These are **unverified interface expectations**, not an assertion that the Worker is deployed or the endpoints work.

## Retailer targets described by handoff
Pick n Pay, Pick n Pay ASAP, Shoprite, Makro, Woolworths, Mr D, Clicks, Checkers, SPAR, Takealot and Dis-Chem. Preserve the actual Worker targets and selectors once source is available. Coupon extraction is heuristic and must be checked against source evidence.

## Queue behavior
One message per target; one target per consumer invocation; at most three concurrent queue consumer invocations; retry twice then dead-letter queue. Queue concurrency is not a complete guarantee of browser concurrency or free-tier compliance, particularly if manual jobs overlap or browser sessions linger.

## Operations and security
- Never embed clone credentials, Worker API keys, or D1 secrets in git. Rotate any token shared in chat.
- Set `API_KEY` with `wrangler secret put API_KEY`; reject unauthorized POST requests even if no secret exists.
- Create or reuse D1 and queue resources, migrate and deploy only after verifying the actual source and Cloudflare limits.
- Log per-merchant successes, failures, retries, stale offers and browser usage; watch DLQ.
- Use conservative timeouts and circuit breakers; do not bypass retailer access controls.
- Distinguish scrape completion from queue acceptance; an enqueued job does not mean offers have been refreshed.

## Cost
The original handoff estimates free-plan usage for twice-daily scraping, but $0 cost and a 5.5-minute daily browser budget are **not verified**. Measure actual runtime and confirm current Cloudflare pricing and limits before claiming free operation.

## Implementation status
Documentation-only handoff. No Worker source imported, no Queue/D1 provisioned, no ProcodiApp discovery code changed, and no deployment performed.
