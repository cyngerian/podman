# Scripts

<!-- last_updated: 2026-04-25 -->

## Overview

`scripts/` holds TypeScript utilities run via `tsx` against the Supabase Management API. They cover three categories:

- **Data lifecycle**: `backup-prod`, `restore-prod`, `sync-staging`
- **Content ETL**: `load-booster-data` (also exposed as `update-sets --sync`)
- **Validation**: `test-packs` — an integration check, not a unit test

All scripts that talk to Supabase go through `scripts/supabase-api.ts`, which wraps the `POST /v1/projects/{ref}/database/query` endpoint with retry-on-429 and exposes shared constants (`DATA_TABLES`, `DATA_TABLES_DELETE`, `AUTH_GENERATED_COLUMNS`, `AUTH_USERS_COALESCE_SQL`).

Each `npm run` entry uses `tsx --env-file-if-exists=.env.local` so local invocations pick up `.env.local` automatically; CI provides env vars via secrets instead.

## Scripts

### `backup-prod.ts` — `npm run backup-prod`

Exports `auth.users`, `auth.identities`, and every table in `DATA_TABLES` (profiles, groups, group_members, group_invites, draft_proposals, proposal_votes, drafts, draft_players) to JSON files in `backups/<ISO-timestamp>/`. Booster data is **not** backed up — it's reloadable from `taw/magic-sealed-data`.

Run before merging any PR that could affect data integrity (per `CLAUDE.md` workflow step 6).

Throttles to ~4 req/s with `sleep(250)` between table queries.

### `restore-prod.ts` — `npm run restore-prod [backup-dir]`

Reads a backup directory (defaults to the most recent one in `backups/`), wipes the target project's data tables in reverse FK order, and re-inserts in FK order. Has a 5-second abort window before destructive ops.

Profiles are **updated** (not inserted) because the `handle_new_user` trigger auto-creates a row when the matching `auth.users` row is inserted. After `auth.users` insertion, GoTrue requires certain varchar columns to be empty strings rather than NULL — this is handled by `AUTH_USERS_COALESCE_SQL`.

The `SUPABASE_PROJECT_REF` env var controls the **target** project, so you can restore prod data into staging (or vice versa) by re-pointing it.

### `sync-staging.ts` — `npm run sync-staging`

End-to-end: pulls prod data, clears staging, replays it. Three phases:

1. Apply any local migrations missing from staging. Migrations whose date prefix is **at or before** the latest staging version are assumed to already exist (e.g. applied via MCP before this script existed) and are just registered in `supabase_migrations.schema_migrations` rather than re-run. This avoids "table already exists" errors when re-syncing.
2. Export prod data via `executeSql` — same set of tables as backup-prod.
3. Clear staging tables in reverse FK order, insert prod data in FK order, then update profiles.

Requires `SUPABASE_PROJECT_REF` (prod), `SUPABASE_STAGING_REF` (staging), and `SUPABASE_ACCESS_TOKEN`.

### `load-booster-data.ts` — `npm run update-sets`, `npm run load-booster-data`

ETL from `https://raw.githubusercontent.com/taw/magic-sealed-data/master/sealed_basic_data.json` into the `booster_products`, `booster_configs`, `booster_config_slots`, `booster_sheets`, and `sheet_cards` tables. Each product is loaded as a single PL/pgSQL `DO` block so sheet IDs can be referenced by config slots within the same statement.

Flags:

| Flag | Behavior |
|------|----------|
| `--sync` | Only load products not already in the DB (used by GitHub Actions and `npm run update-sets`) |
| `--set <code>` | Filter to one set code (e.g. `--set fin`) |
| `--clear` | Wipe before loading. With `--set`: deletes only that set. Without: `TRUNCATE ... RESTART IDENTITY CASCADE` |

`--sync` cannot be combined with `--clear` or `--set`.

After loading, **always** invalidates Upstash Redis `booster:<code>` keys for affected products. If `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are missing, KV invalidation is silently skipped (warns instead of failing) — fine for local dev, but the daily Actions run sets both.

Throttled to ~4 req/s. Exits non-zero if any product failed to load.

### `test-packs.ts` — `npm run test-packs`

Two-phase validation against **production** Supabase booster data + Scryfall:

- **Phase 1** (DB integrity): every product has at least one config; every config has at least one slot; every slot points to an existing sheet; every sheet's stored `total_weight` matches the sum of its cards' weights; no orphan sheets (sheets not referenced by any slot).
- **Phase 2** (pack generation): resolves all `(set, collector_number)` identifiers via Scryfall, generates `--packs N` packs (default 24), and validates each pack — non-empty, no same-sheet name duplicates per the taw spec (cross-sheet duplicates like foil + non-foil are allowed). Sets a `fail` severity if resolve rate < 95% or any pack is empty.

Filters to user-relevant product types only: `<set>`, `<set>-play`, `<set>-draft`, `<set>-set`, `<set>-collector`.

Flags: `--set <code>`, `--db-only`, `--packs <n>`, `--verbose` (show passing products in the summary table).

Reads `PROD_SUPABASE_URL` / `PROD_SUPABASE_SECRET_KEY` from `.env.local` and aliases them to `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SECRET_KEY` at startup so it can reuse `createAdminClient()` from the app code.

### `supabase-api.ts` — shared library, not invoked directly

`executeSql(projectRef, accessToken, sql)` with retry-on-429 (2s/4s/8s/16s/32s exponential backoff, 5 attempts). `requireEnv(name)` exits with an error if missing. `esc(s)` single-quote SQL escape. `sleep(ms)`. `DATA_TABLES` / `DATA_TABLES_DELETE` define FK-safe insert / delete order. `AUTH_USERS_COALESCE_SQL` repairs NULL→`""` after restoring auth rows so GoTrue can read them.

## Environment Variables

| Var | Used by | Source |
|-----|---------|--------|
| `SUPABASE_PROJECT_REF` | backup-prod, restore-prod, sync-staging, load-booster-data | `.env.local`, GitHub secret (Actions) |
| `SUPABASE_STAGING_REF` | sync-staging, update-sets.yml (staging job) | `.env.local`, GitHub secret |
| `SUPABASE_ACCESS_TOKEN` | all of the above | personal access token from supabase.com/dashboard/account/tokens |
| `PROD_SUPABASE_URL` | test-packs | `.env.local` |
| `PROD_SUPABASE_SECRET_KEY` | test-packs | `.env.local` |
| `UPSTASH_REDIS_REST_URL` | load-booster-data (KV invalidation) | `.env.local`, GitHub secret |
| `UPSTASH_REDIS_REST_TOKEN` | load-booster-data (KV invalidation) | `.env.local`, GitHub secret |

The runtime env vars (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `BLOB_READ_WRITE_TOKEN`, etc.) live in `CLAUDE.md` and are not used by these scripts directly — except `test-packs`, which aliases the `PROD_*` pair into the runtime names so it can reuse the app's admin client.

## Common Tasks

**Back up before merging a PR**

```bash
npm run backup-prod
```

Writes to `backups/<ISO-timestamp>/`. Commit nothing; backups are gitignored.

**Restore from a backup**

```bash
npm run restore-prod                        # most recent
npm run restore-prod backups/2026-04-25T18-00-00
```

Five-second abort window before destructive ops. Defaults to the latest in `backups/`.

**Sync prod data into staging**

```bash
npm run sync-staging
```

Apply any new local migrations to staging, then replay prod data. Booster data is not synced — run `update-sets` separately if needed.

**Add support for a new MTG set**

```bash
npm run update-sets                         # picks up everything new
npm run load-booster-data -- --set <code>   # one set, leaves others alone
```

Both invalidate `booster:<code>` Upstash keys. The daily 10:00 UTC GitHub Actions run handles this automatically against both prod and staging.

**Validate pack generation against production**

```bash
npm run test-packs                          # all sets, both phases (~10+ min)
npm run test-packs -- --set fin             # one set
npm run test-packs -- --db-only             # skip Scryfall (fast)
```

Exits non-zero on any `fail` severity — useful for ad-hoc validation after a `load-booster-data` run.
