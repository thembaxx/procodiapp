# Daily and on-demand promotion discovery

**Discover promotions** runs daily at **04:17 UTC / 06:17 SAST** and supports manual dispatch on [GitHub Actions](https://github.com/thembaxx/procodiapp/actions/workflows/discovery.yml). GitHub can queue scheduled runs; exact timing is not guaranteed.

The worker runs `pnpm discover` on Actions, searching Tavily for Checkers Sixty60, Pick n Pay asap!, Woolworths Dash, Shoprite, SPAR2U and Makro, then checking source pages and extracting offers with OpenAI. The app's **Refresh** button uses the same scan/update service. Both write to the same Supabase `promotion_cache` row. The workflow does not depend on `APP_URL` or a long-running Vercel request.

## Activate

1. Configure Supabase and apply the current `supabase/schema.sql` to the intended project, including its wall-clock cooldown correction. Use the server-only service-role key, never the anonymous key.
2. Add these [GitHub Actions secrets](https://github.com/thembaxx/procodiapp/settings/secrets/actions), either at repository level or in the `discovery` environment:

   - `TAVILY_API_KEY`
   - `OPENAI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RATE_LIMIT_SECRET` — the same separate random 32+ character value as the app

3. Set the same values on the production app host, plus `SEARCH_PROVIDER=tavily`, then redeploy. Set `EXTRACTION_MODEL` on the server and optionally as a repository variable; the default is `gpt-4.1-mini`. Keep the other [production configuration](production.md).
4. Restrict the `discovery` environment to trusted main deployments and [protect main](repository-automation.md). The workflow rejects other refs and receives provider/database secrets only after dependency installation. Its repository token is read-only.
5. Select **Run workflow → main**. Check the success summary, then `/api/offers`: `mode` should be `web_search`, `updatedAt` should advance, and per-store checks should include `searched: true` and successful `extractedPages`. Zero offers can be a legitimate successful result. Press Refresh in the app to verify it loads the shared data.

Never paste keys in chat/issues, commit environment files, or use `NEXT_PUBLIC_*` for server credentials. Owner setup remains necessary: the current connection returns HTTP 403 for secret administration and live storage has been unavailable. Committed configuration and mock-provider tests do not establish successful live discovery.

## Validation and updates

- Queries use the current South African date and online grocery/free delivery/discount terms. Search results, current-code pages and official sources share a bounded page budget.
- URLs use exact approved hosts. Aggregator paths must identify the retailer; Picodi pages must be South African. Robots policies, redirects, byte caps and deadlines still apply. Login/CAPTCHA and inaccessible app-only campaigns are not bypassed.
- Codes require quoted source/code evidence and a published, parseable, unexpired expiry. Unknown expiry and impossible calendar dates are rejected. Explicit recurring membership benefits may have no expiry and show **No code needed**, with their fees/criteria.
- A completed source evaluation supersedes its old listings. Ended or no-longer-confirmed codes are removed. Source/extraction failures retain only still-fresh previous listings without extending their deadlines. Stale/expired records are pruned. Total failure does not advance the successful scan timestamp.
- Deduplicated listings retain retailer, code, criteria, minimum basket, source, expiry and review/freshness times. Pages, filters, copying and offline snapshots use this data. Evidence establishes a source-listed promotion, not checkout success; codes stay marked **not tested at checkout**.
- All triggers share the atomic ten-minute discovery budget; browser clients also have a one-minute limit. Recent completed scans return immediately. Busy scans without a fresh result return 429; the worker waits briefly for the active scan rather than launching another paid search. Failed attempts cool down too. Configure provider spending caps and alerts.
- Scheduled cleanup removes expired limit rows and reports eligible after 30 days before searching. Logs contain only counts and generic failures, never keys, coupon contents, source bodies or private report data. Missing configuration and total provider/search failure fail the job explicitly.

Inspect safe `checks[].message` for unavailable stores and retry later. Alert on failed daily jobs and a successful scan timestamp older than 24 hours. Refresh needs connectivity; offline mode retains its expiry/freshness rules.

The authenticated `GET /api/cron` remains an alternative scheduler entrypoint using `CRON_SECRET` and the same shared budget. `scripts/run-discovery.mjs` is an optional HTTPS caller; GitHub uses the direct worker. No SQL migration or account setup is performed automatically.
