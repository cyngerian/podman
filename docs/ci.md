# CI/CD

<!-- last_updated: 2026-07-21 -->

## Overview

CI/CD is split between **GitHub Actions** (correctness gates) and **Vercel** (deployment).

- **GitHub Actions** runs lint + type-check/build + unit tests on every PR, a parallel integration job (RLS + E2E) on every PR, and a daily MTG set sync against both prod and staging Supabase.
- **Vercel** auto-deploys: a preview environment on every PR push (using staging Supabase env vars), and production on merge to `main`. Preview URLs persist after merge.

Local dev does not run lint or build (`npm run lint` / `npm run build` are CI-only per `CLAUDE.md`); developers use `npm test` for the engine and the PR preview URL for everything else.

## Workflows

Two workflows live in `.github/workflows/`:

### `ci.yml` — PR validation

Runs on `pull_request` against `main`. **Two jobs, in parallel.**

#### Job `ci` — the fast gate

Five steps after `actions/checkout@v4`:

1. `actions/setup-node@v4` — Node.js 22, npm cache enabled
2. `npm ci`
3. `npm run lint`
4. `npm run build` — type-check + Next.js production build, with placeholder env vars (see [Secrets and Environment](#secrets-and-environment))
5. `npm test` — Vitest unit suite (341 tests, no services, sub-second)

#### Job `integration` — RLS + E2E

Boots Docker containers and a browser, so it is kept out of `ci` to leave that
job fast. `timeout-minutes: 25`.

1. `actions/setup-node@v4` + `npm ci`
2. `supabase/setup-cli@v1`, pinned to CLI **2.109.1**
3. `supabase start` — applies every migration in `supabase/migrations/` to a
   fresh Postgres. This is also the only place the migration set is verified to
   build a working database from scratch
4. `npm run test:rls` — 57 RLS integration tests against that stack
5. `npx playwright install --with-deps chromium`
6. `npm run test:e2e` — Playwright builds and starts the app itself
   (`playwright.config.ts` → `webServer`) pointed at the local Supabase

On failure it uploads `playwright-report/` and `test-results/` (trace + video,
7-day retention) and dumps `supabase status`. Retries are off by design — see
[Testing](./testing.md#e2e-suite).

Neither suite takes GitHub secrets: the local stack's keys are the published
defaults, read at runtime from `supabase status`.

### `update-sets.yml` — Daily booster data sync

Two sequential steps that both run `npx tsx scripts/load-booster-data.ts --sync`, once against production and once against staging. The script downloads `taw/magic-sealed-data` and inserts only products not already in `booster_products`, then invalidates Upstash `booster:*` keys.

Triggered by:
- `schedule`: cron `0 10 * * *` — daily at 10:00 UTC
- `workflow_dispatch` — manual trigger from the Actions UI

## Triggers

| Workflow | Event | Filter |
|----------|-------|--------|
| `ci.yml` (jobs `ci` + `integration`) | `pull_request` | branches: `[main]` |
| `update-sets.yml` | `schedule` | `0 10 * * *` (daily 10:00 UTC) |
| `update-sets.yml` | `workflow_dispatch` | none |

There is no `push` trigger on `main` — production deploys are handled by Vercel's git integration, not Actions.

## Secrets and Environment

### `ci.yml`

Build is run with hardcoded placeholders so it can type-check without leaking real credentials:

- `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_placeholder`
- `NEXT_PUBLIC_SENTRY_DSN=""`

No GitHub secrets are consumed — the build doesn't need to talk to any service. Sentry source-map uploads (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`) are not run from CI; they happen in Vercel builds, not here.

The `integration` job takes no secrets either. Everything it needs comes from
the local stack: `tests/integration/helpers/env.ts` reads `supabase status -o
env`, and `playwright.config.ts` passes those values to the app under test as
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and
`SUPABASE_SECRET_KEY` (with `NEXT_PUBLIC_SENTRY_DSN` blanked).

### `update-sets.yml`

Both jobs (prod + staging) consume the same four GitHub secrets:

- `SUPABASE_PROJECT_REF` (prod) / `SUPABASE_STAGING_REF` (staging)
- `SUPABASE_ACCESS_TOKEN` — personal access token with Management API permissions
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

The KV invalidation step in `load-booster-data.ts` skips silently if the Upstash vars are missing, so a missing secret manifests as stale cache rather than an error.

The full env var inventory (production runtime + scripts) is in `CLAUDE.md` → "Environment Variables".

## Dependency Audit Posture

<!-- Updated 2026-07-21 (podman-9). Re-check when Next.js ships a release above 16.2.11. -->

`npm audit` is not clean and cannot be made clean today. Accepted state:

| Advisory | Severity | Why it stays |
| --- | --- | --- |
| `postcss` GHSA-qx2v-qp2m-jg93 | moderate | Transitive under `next`, which pins `postcss@8.4.31` exactly. Unfixable without a Next.js release. |
| `sharp` GHSA-f88m-g3jw-g9cj | high | Transitive **optional** dep of `next` (`sharp@^0.34.5`), used only for self-hosted image optimization. On Vercel, image optimization runs on the platform, so this code path is not in the request path. Unfixable without a Next.js release. |

`npm audit fix --force` is **not** an acceptable remedy here — it resolves the
`postcss`/`sharp` chain by downgrading to `next@9.3.3`. Do not run it.

Anything reachable by `npm audit fix` (no `--force`) should be fixed rather than
listed above — the table is for advisories with no non-breaking remedy, not for
ones that are merely inconvenient. Both rows above are the same root cause:
`next` pins `postcss` exactly and pins `sharp` to `^0.34.5`, so they clear only
when Next.js ships a release above 16.2.11.

## Local Reproduction

The exact CI command sequence:

```bash
npm ci
npm run lint
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_placeholder \
NEXT_PUBLIC_SENTRY_DSN= \
npm run build
npm test
```

And the `integration` job:

```bash
npx supabase start
npm run test:rls
npx playwright install chromium
npm run test:e2e
```

To reproduce the daily set sync against staging locally (without touching prod):

```bash
SUPABASE_PROJECT_REF=$SUPABASE_STAGING_REF \
SUPABASE_ACCESS_TOKEN=... \
npx tsx scripts/load-booster-data.ts --sync
```

Vercel preview deploys cannot be reproduced fully locally, but `npm run build` plus `npm run dev` covers ~95% of what the preview does — the gaps are Vercel-specific edge runtime behavior and `@vercel/blob` upload paths.
