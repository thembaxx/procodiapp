# Grocery Codes SA

A mobile-first app for finding South African grocery promotions, reading the terms, and copying a code in one tap. Built with **Next.js 16, React 19, TypeScript, Tailwind CSS 4, Motion, Three.js, Hugeicons, oxlint, oxfmt and pnpm**.

Three working designs are included. Open the header's settings gear to choose a view from illustrated previews, set a light, dark or system theme, and control animated backgrounds. The mobile sheet can be swiped down to close; desktop uses a side panel. Your preferences and saved offers persist in your browser.

| Wallet · default                                                                        | Rewards                                                                                   | Orbit                                                                                 |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Stacked brand-colour cards, mint accents and a dark canvas.                             | A bright blue hero, generous offer tiles and a light theme.                               | Editorial serif typography and a swipeable store carousel.                            |
| <img src="docs/previews/wallet-phone.png" width="250" alt="Wallet design on a phone" /> | <img src="docs/previews/rewards-phone.png" width="250" alt="Rewards design on a phone" /> | <img src="docs/previews/orbit-phone.png" width="250" alt="Orbit design on a phone" /> |

[Compare the designs](docs/designs.md) · [Settings preview](docs/previews/settings-phone.png) · [Desktop preview](docs/previews/wallet-desktop.png)

## Run locally

Use Node.js 24 and pnpm 11.19.0:

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`. You can link directly to `/?design=wallet`, `/?design=rewards` or `/?design=orbit`. Dark, light and system themes are supported; dark is the initial default. Rewards switches to light when selected, and settings can change it.

The document canvas, page, loading skeleton, browser theme colour and install manifest share the active background. A small inline head script applies saved preferences before React loads and keeps browser metadata in sync with theme and design changes. Light Orbit uses its lavender canvas throughout. Dynamic viewport heights and safe-area insets cover mobile browser bars, notches and landscape layouts. Browser chrome and installed splash-screen behaviour still depend on platform support; existing installs may keep their original launch colour until their manifest updates.

For a production Node server:

```sh
pnpm build
pnpm start
# Optional port:
pnpm start --port 4000
```

The build prepares Next's standalone server and its static assets. The start script loads standard production environment files and keeps local data outside the build directory.

## Promotion data and discovery

The attached prototype contains placeholder coupon codes. **None of those codes are used in live results.** The initial data is a small, manually reviewed primary-source snapshot of recurring benefits, reviewed on 8 October 2026. Each record has a 24-hour freshness deadline; stale records disappear unless a successful source check renews them. An ongoing benefit is explicitly labelled with no listed end date. Availability depends on the retailer's terms and checkout.

The initial snapshot includes Checkers Xtra Savings Plus delivery, Woolworths MyDifference PLUS online delivery, and Makro's senior food discount. Woolworths online delivery is not presented as confirmed Dash free delivery. Offers requiring membership show that requirement. Stores without a confirmed offer remain visible at the bottom.

**Without API keys:** refresh checks configured public retailer pages, revalidates the known recurring benefits when their evidence is found, and records which sources could be read. This mode does not perform broad internet search or extract arbitrary new coupon codes. Retailer anti-bot protections, JavaScript-only pages and robots restrictions can make a source unavailable. Partial results retain still-fresh listings without extending their freshness deadline.

**To discover new offers across the web**, configure both search and extraction:

```dotenv
SEARCH_PROVIDER=tavily
TAVILY_API_KEY=your_server_only_key
OPENAI_API_KEY=your_server_only_key
EXTRACTION_MODEL=gpt-4.1-mini
```

The pipeline queries Tavily for each store, checks candidate URLs against the supported retailer/voucher-domain list, honours robots rules, and reads accessible public pages with timeouts and size limits. OpenAI extracts structured offers; Zod validates them. Verbatim evidence must exist in the fetched page, a coupon must appear in its code evidence, and expiry must be supported. Unknown-expiry promotions and expired offers are excluded. An explicitly recurring membership benefit may have a null expiry. LLM extraction is evidence-checked but still requires human review for unusual terms; it does not test checkout.

All discovered codes are marked **not tested at checkout**. The app never generates or silently guesses a coupon code. Date-only expiry is interpreted as 23:59:59.999 in `Africa/Johannesburg` (UTC+2). Offers are deduplicated by retailer plus code or title. Every listing links to its source, shows its last review time, and supports reporting a problem.

## API

| Endpoint                                | Behaviour                                                                                                                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/offers?filter=all&q=checkers` | Fresh, unexpired offers. Filters: `all`, `free_delivery`, `discount`. Search matches retailer and loyalty names.                                                                                                  |
| `POST /api/refresh`                     | Checks public sources and optionally web-search candidates. Returns offers, new IDs and per-store source status. One attempt per minute per client; concurrent searches within a process share one discovery job. |
| `POST /api/report`                      | Saves a report for an existing listing. Body: `{ "offerId": "...", "reason": "The code didn't work" }`. Also accepts `The offer has ended` and `The terms are different`.                                         |
| `GET /api/cron`                         | Authenticated discovery. Header: `Authorization: Bearer <CRON_SECRET>`.                                                                                                                                           |

Refresh and reports validate browser origin. Set `TRUST_PROXY=true` only when the deployment ingress overwrites `x-forwarded-for`; otherwise all local clients share a conservative refresh bucket. No raw IP addresses are stored. The single-node development limiter is in memory; Supabase provides an atomic distributed limiter.

## Persistence

For local development or a single Node server, the app writes cache and reports to `.data/` using atomic cache-file replacement. Set `DATA_DIR` to a persistent volume in production. Without a persistent volume, data can be lost when an instance restarts.

For serverless or multiple instances, run [`supabase/schema.sql`](supabase/schema.sql), then set:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
```

This stores the shared offer cache, reports and rate limits in Postgres through Supabase REST. Row level security is enabled; clients cannot read or mutate these tables. Reports are stored for review in `promotion_reports` or `.data/reports.jsonl`; there is no admin dashboard in this version.

## Scheduled discovery and deployment

A Dockerfile is included for a Node deployment. Mount `/app/.data` on a persistent volume, or configure Supabase. Provide discovery secrets at runtime, not during the build. A static-only host cannot run the discovery APIs.

The GitHub discovery workflow runs every six hours after you set repository variable `APP_URL` to the deployed origin and secret `CRON_SECRET` to the same value used by the server. It is skipped while `APP_URL` is unset. You can also schedule the authenticated endpoint with your hosting provider. No hosting account or provider API keys are bundled in this repository.

## Quality checks

```sh
pnpm check       # oxlint, oxfmt, TypeScript and Vitest
pnpm build
pnpm exec playwright install --with-deps chromium firefox webkit
pnpm test:e2e
```

Browser tests use an isolated server on port 3100 and temporary fixtures in `.data/e2e`. Their coupon is test-only and never enters production sources. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when using an existing Chromium binary.

Tests cover expiry/freshness, South African dates, deduplication, source boundaries and evidence; mobile and desktop tests cover search, filters, accordion behaviour, copy, saved offers, reports and refresh limits. Settings checks cover saved choices, focus return, Escape, sheet dragging, small and landscape screens, and changes to the device's motion preference. Automated axe checks scan all three designs in both themes on mobile and desktop, including the settings panel. Appearance and settings checks also run in Firefox and mobile WebKit. Software WebGL checks in Chromium verify all three scenes, a single canvas, context-loss recovery and the sparkle action; every engine tests the no-WebGL fallback. A GitHub CI workflow runs these checks on pushes and PRs.

## Design and accessibility

The UI follows the attached Wallet handoff and card references: overlapping store cards, clear offer counts, full-width copy actions, no-code states, brand-responsive ambient colour, and a calm count-up. Hugeicons provide interface icons throughout; the grocery bag remains a custom illustration. Motion adds gentle pointer tilt, spring filters, press feedback, copy checkmarks and bookmark pops. Saving or copying an offer sends a small pulse through the background; the sparkle beside today's count invites the same delight. Pull-to-refresh distinguishes vertical movement from a horizontal carousel swipe.

Each view has its own transparent Three.js scene over the shared page colour: soft ribbons for Wallet, floating rounded tiles for Rewards, and orbiting rings for Orbit. The renderer loads separately after hydration, caps rendering at 30fps and pixel ratio at 1.25 on phones or 1.5 on larger screens, and pauses in hidden tabs. Geometry and listeners are disposed when disabled. Reduced-motion and data-saving visits skip the renderer; unavailable WebGL keeps the static ambient background. All motion respects `prefers-reduced-motion`, including preference changes during a visit.

Controls are labelled; search and filters work on small screens; dialogs use native focus trapping and Escape dismissal; keyboard focus is visible. Saved offers stay on the device. The install manifest is included, but offline discovery and a service worker are not implemented, so this is not an offline app.

Fonts are self-hosted Plus Jakarta Sans, Bricolage Grotesque and Instrument Serif, with their OFL licences in `public/fonts`. Retailer names are rendered as typographic identifiers and fallbacks rather than claiming to be official logo assets. Verified retailer-supplied SVGs can replace `StoreMark` when provided. Retailer names and marks belong to their owners; the app is independent and uses no affiliate links.
