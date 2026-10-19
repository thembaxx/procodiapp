# Source recovery status

The original Cloudflare Worker artifact is inaccessible. This directory is being
reconstructed from the user's pasted conversation, not copied from a verified repository.

## Recovered
- Queue/cron/D1 Wrangler configuration (D1 ID remains intentionally unset)
- Shared TypeScript interfaces
- Non-destructive initial D1 schema
- Original scraper target list, main Worker and Puppeteer source pasted in chat
- Architecture and implementation notes in CODEX_PROMPT.md and HOW_IT_WORKS.md

## Must validate before deployment
- Worker source is incomplete in the transcript: src/index.ts cuts off in storeCoupons().
- Original package.json and README.md contents were not supplied.
- Verify Cloudflare Browser Rendering binding and Quick Action API; do not use
  the transcript's unverified BROWSER.quickAction() method blindly.
- Scraper selectors and retailer URLs are unverified and may return no deals.
- Reject unauthenticated POST /api/scrape when API_KEY is absent.
- Do not return raw exception messages to public API clients.
- Validate expiration and source URLs; text such as 'ends Sunday' is not ISO.
- Track retailer-specific scrape failures and avoid presenting inferred discounts
  as verified coupon codes.
- Re-check account-specific Browser Rendering, Workers and Queues quotas;
  twice daily does not guarantee free usage.
- Do not deploy or migrate against production until checks pass.

## Next implementation steps
1. Reconstruct and typecheck Worker source and Puppeteer adapter.
2. Add parser, D1 and queue tests; mock network/browser calls.
3. Confirm and set D1 database ID, queue resources and API_KEY secret.
4. Deploy staging Worker and verify sample responses from retailer sources.
5. Integrate into ProcodiApp as primary with existing fallback intact.
