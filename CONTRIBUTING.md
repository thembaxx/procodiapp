# Contributing to Little Less

Use Node.js 24 and pnpm 11.19.0. Create a branch from current `main`, make a focused change, and open a pull request using the provided template. Run `pnpm check` and relevant browser checks before requesting review.

Read `AGENTS.md` and the installed Next.js guides before changing framework code. Keep interface icons consistent with Hugeicons; preserve mobile layouts, accessibility, reduced-motion behavior, offline functionality, source evidence and South African dates.

CI checks formatting, lint, types, unit/browser tests, PostgreSQL permissions and concurrency, secret history, dependencies, workflow syntax and CodeQL. `CI gate` fails when any required job fails or is skipped. Do not remove a check to hide a failure. Review third-party updates and SQL migrations before release; do not automatically merge dependency PRs.

Never put secrets, personal data or production logs in a branch, issue, screenshot or review comment. Use test fixtures and `.env.local`. Follow [SECURITY.md](SECURITY.md) for private findings. CodeRabbit reviews do not replace an independent human/code-owner approval.

The intended main rules require an up-to-date branch, resolved review threads and one independent code-owner approval, and prevent force pushes/deletion. These are server settings: configuration files alone do not activate protection. See [repository automation](docs/repository-automation.md) for actual setup and verification, integration connections and deployment/rollback.
