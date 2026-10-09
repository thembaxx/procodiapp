# Repository automation and release controls

Repository: `thembaxx/procodiapp`. Workflows and review configuration are versioned here. Server-side protection, app installations and secrets require separate verification; committed files are not evidence that those controls are active.

## CI

The **Checks** workflow runs on main pushes, pull requests, merge groups, manual dispatch and a weekly full recheck. It has read-only default permissions, explicit timeouts and PR concurrency cancellation. Third-party action code is pinned to commit SHAs.

The **CI gate** depends on every job and fails for failed, cancelled or skipped checks:

- oxlint, oxfmt, TypeScript and unit tests; a production build and real Chromium/Firefox/WebKit browser/PWA tests;
- repeatable PostgreSQL migration, actual unprivileged read refusal, service-role RPCs, retention and atomic concurrency;
- checksum-verified Gitleaks against full history, with redacted output;
- a moderate-or-higher dependency advisory gate and PR dependency review;
- checksum-verified actionlint, including shell checks when available on the runner;
- extended CodeQL analysis uploaded to GitHub, and a local SARIF gate that fails for high/critical security or error-level findings. Empty/malformed analysis fails closed.

Dependabot opens weekly npm/pnpm, GitHub Actions and Docker updates. Minor/patch updates are grouped; major updates remain separate. No automatic dependency merging is configured. Keep pinned scanner/CLI versions current and review upstream checksums before updating them. CodeQL can report false positives: investigate and document any narrow suppression rather than disabling the gate.

## Protect main and repository settings

Review [.github/main-ruleset.json](../.github/main-ruleset.json). The active ruleset requires **CI gate** from the GitHub Actions app (ID 15368), an up-to-date branch, one independent code-owner approval, dismissal of stale reviews, approval after the last push and resolved threads. It prohibits deletion, force pushes and merge commits, with **no bypass actors**.

`CODEOWNERS` initially lists `@thembaxx`. GitHub does not let an author approve their own PR. **Add a trusted collaborator/code owner** before enabling protection if the owner needs to author changes; AI review cannot satisfy this human policy. Alternatively, the owner must explicitly choose a less restrictive solo-maintainer policy.

Run the reviewed setup using a GitHub session with repository administration permission:

```sh
node scripts/configure-github.mjs          # Review proposed operations; no writes
node scripts/configure-github.mjs --apply  # Apply with authorized administration access
```

The script adds a ruleset without replacing existing protections. If a rule with this name already exists, it leaves it untouched for manual inspection. It also requests squash-only merging, branch cleanup, auto-merge availability, Dependabot alerts/security updates, native secret scanning/push protection, private vulnerability reporting and a read-only default Actions token that cannot approve PRs. Auto-merge availability does not turn on automatic merging for any PR.

Verify in [Rules](https://github.com/thembaxx/procodiapp/settings/rules), [Security](https://github.com/thembaxx/procodiapp/settings/security_analysis) and [Actions](https://github.com/thembaxx/procodiapp/settings/actions). Repository owner role and a credential's API permissions differ; a 403 from the current integration cannot establish whether an inaccessible control is already enabled. Re-run the script only with appropriate access, not by committing an admin token. Review MFA, least-privilege collaborators, signing practices and restore access separately.

## GitGuardian

“GitHub guardian” is interpreted as **GitGuardian** unless corrected. Install the [GitGuardian GitHub app](https://github.com/apps/gitguardian) for this repository to enable its repository/PR scanning. Its app status check should become required only after the installation produces a real check and its exact context/app ID are verified.

An additional pinned ggshield workflow is available for trusted main pushes and weekly/manual checks. Store an API key as the GitHub secret `GITGUARDIAN_API_KEY`, then set repository variable `GITGUARDIAN_ENABLED=true`. If enabled without a key it fails explicitly. It does not run on PRs or expose the key to forked contributions. Without the variable it is **inactive**, not a passed external scan. Gitleaks remains a required independent scan without an external account.

GitGuardian sends repository/commit content to its service for analysis; restrict the installation to this repository and review service retention, processing and permissions. ggshield action code is pinned, while its upstream Docker image uses the upstream release tag. Rotate API keys and review the image when updating the action.

## CodeRabbit

Install the [CodeRabbit GitHub app](https://github.com/apps/coderabbitai) for this repository. [.coderabbit.yaml](../.coderabbit.yaml) enables incremental assertive reviews, disables poems, provides security/accessibility/offline instructions, excludes runtime/env/binary files and opts out of retained knowledge-base features. This opt-out does not guarantee zero provider logs or inference retention; verify the provider's policies and installation access.

The configuration has been checked against CodeRabbit's official v2 schema. A configuration file does not install the app. Confirm a real review on a new PR before describing CodeRabbit as active. Do not add a nonexistent CodeRabbit check to main protection, and keep independent human approval mandatory. AI review suggestions still need validation.

## Production CD

The existing Vercel Git integration deploys automatically and may deploy before GitHub CI completes. **It is not a CI-enforced release gate.** The new opt-in **Deploy production** workflow runs only after successful Checks for a trusted main push/manual run. It checks the exact SHA, builds against private production configuration, deploys using `--prod --skip-domain`, checks the candidate, then rechecks main before promotion. Failures before promotion leave the current production aliases untouched. The production candidate still has production runtime credentials: smoke requests are read-only and database migrations are not performed automatically.

To activate:

1. Resolve the [launch blockers](security-audit.md), apply the SQL migration and configure production storage/operator/provider secrets in Vercel. The workflow requires the configuration check and durable Supabase storage for Vercel.
2. Configure GitHub's `production` environment with trusted deployment branches and any required reviewers. Put a restricted Vercel deployment token in its `VERCEL_TOKEN` secret. Set repository variables `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` to the existing project IDs. If deployment protection is enabled, add its automation bypass value as the environment secret `VERCEL_AUTOMATION_BYPASS_SECRET`.
3. Set repository variable `PRODUCTION_CD_ENABLED=true`. Run Checks manually on main to test the complete candidate/promotion workflow; verify the exact SHA, logs and endpoint readiness.
4. Once that path works, disable overlapping automatic Git deployments in Vercel (or set its reviewed `git.deploymentEnabled` configuration). Keep preview deployments only if desired. Verify that a failing CI commit cannot change production. Until this switch is verified, production is still governed by the existing integration.

The pinned Vercel CLI is **63.1.0**. Configuration is downloaded into ignored `.vercel/`, never uploaded as an artifact, and removed even after failure. No deployment or database credentials are present in the repository. Forked/untrusted PR workflows have no deployment secrets. The production job is serialized and refuses obsolete SHAs; preventing direct writes with the server ruleset closes the remaining release race.

Candidate smoke checks require healthy storage, the public offers shape, homepage/store/privacy content and a JavaScript service worker. A production 503 blocks promotion. They do not prove that a discount works, the scheduler has run, provider keys function or remote SQL permissions are correct. No paid-provider calls or production mutations are performed by this check.

For rollback, use Vercel's rollback/promote controls for a previously verified production deployment, then revert the change through a reviewed PR. Keep the last known-good deployment until validation completes. Review database compatibility before rolling back application code; automatic destructive migrations and automatic rollback are intentionally not configured. Deployment artifacts and browser failure reports have short retention; do not upload runtime data or production env files.

## Connection status

The current GitHub integration can push code and run CI, but administration/settings and variable/secret reads returned **HTTP 403**. GitGuardian/CodeRabbit installations and production CD credentials are unverified. Plugin discovery found no matching connector for either provider. Owner-side setup is needed wherever the API denies access; do not mistake prepared configuration for an active connection.
