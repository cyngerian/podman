# Testing

<!-- last_updated: 2026-07-21 -->

## Overview

There are three test surfaces, each with its own runner:

| Suite | Command | Needs | Runtime |
|-------|---------|-------|---------|
| **Unit** — pure logic + hand-mocked server actions | `npm test` | nothing | < 1s |
| **RLS integration** — real Postgres, real policies | `npm run test:rls` | local Supabase | ~2s + stack boot |
| **E2E** — real browser, real app, real DB | `npm run test:e2e` | local Supabase + a build | ~30s |

The unit suite stays deliberately offline and fast — it's the one developers run
in a watch loop. The other two boot Docker (and, for E2E, Chromium), so they run
in a separate CI job (see [CI/CD](./ci.md)).

There are still no UI/component tests; the React layer is covered only where the
E2E happy path walks through it.

A separate validation script, `scripts/test-packs.ts` (run via `npm run test-packs`), tests pack generation against the live booster_products data + Scryfall and is **not** part of the Vitest suite.

## Unit Suite

Most tests live in `src/lib/__tests__/`; the two exceptions are noted below. Counts are authoritative as of `npm test` on 2026-07-21.

| File | Tests | Covers |
|------|-------|--------|
| `draft-engine.test.ts` | 88 | Pure-function draft state transitions: `createDraft`, `startDraft`, `makePickAndPass`, `advanceToNextPack`, `transitionToDeckBuilding`, `unsubmitDeck`, pass-direction logic |
| `pack-generator.test.ts` | 30 | Legacy/per-set pack generation paths |
| `bot-drafter.test.ts` | 25 | Rarity-first → color-commit bot algorithm and Winston bot decisions |
| `sheet-pack-generator.test.ts` | 23 | Sheet-based pack generation: skeleton → resolve → name-based per-sheet dedup, `buildNameMap` |
| `draft-mutation.test.ts` | 19 | `applyDraftMutation` optimistic concurrency: version guard, retry-on-zero-rows, error paths |
| `card-utils.test.ts` | 17 | Color utilities, DFC color union, mana-cost helpers |
| `export.test.ts` | 17 | `.cod`, `.txt`, and clipboard exports — including `deckName` handling |
| `.../dashboard/groups/__tests__/actions.test.ts` | 19 | Server-action auth/membership guards |
| `proposal-validation.test.ts` | 14 | Draft proposal input validation |
| `scryfall.test.ts` | 12 | Collector-number normalization (DFC `a/b`, `★`, "The List" `SET-NUM`) |
| `kv.test.ts` | 14 | Upstash wrapper: TTL passthrough (`ex`), no-TTL and unconfigured paths, error swallowing, booster 24h default |
| `deck-saver.test.ts` | 10 | Debounced deck auto-save |
| `src/app/api/avatar/__tests__/route.test.ts` | 9 | Avatar upload MIME allowlist and auth |
| `fetch-json.test.ts` | 6 | JSON fetch wrapper and `FetchJsonError` |
| `async-guard.test.ts` | 6 | Async guard helper |

The path alias `@/*` → `./src/*` is wired up in `vitest.config.ts`, which also
excludes `tests/` — that directory belongs to the integration and E2E runners.

## RLS Integration Suite

`tests/integration/rls.test.ts` — **60 tests**, run with
`npm run test:rls` (`vitest.integration.config.ts`).

It talks to a **real** local Supabase. That is the point: a PostgREST double
cannot tell you whether a policy recurses, whether `anon` still holds EXECUTE on
a SECURITY DEFINER helper, or whether a `WITH CHECK` clause fires. Two specific
regressions it exists to catch:

1. **Policy recursion.** `20260213000300_fix_rls_infinite_recursion.sql` replaced
   self-referencing `group_members` / `draft_players` policies with SECURITY
   DEFINER helpers (`user_group_ids`, `user_draft_ids`, `is_group_admin`). A
   naive rewrite reintroduces error 42P17, which shows up as a *query error*,
   not as wrong rows — so every read-path test asserts `error` is null as well
   as checking visibility.
2. **Function privileges.** `20260717000000_harden_function_privileges.sql`
   revoked EXECUTE from `anon` on the RLS helpers and trigger functions while
   keeping it for `authenticated` (policies evaluate helpers as the querying
   role — revoking from `authenticated` breaks every policy that uses one).
   Both directions are asserted.

Coverage: `groups`, `group_members`, `drafts`, `draft_players`,
`draft_proposals`, `proposal_votes`, `group_invites`, `profiles` — each from a
member, a non-member, and `anon` — plus the helper privilege surface, the invite RPCs
(`get_invite_info` for anon, `accept_group_invite` for authenticated), and
`get_draft_pick_view`'s self-authorization.

Reading the assertions: an RLS denial on SELECT surfaces as **zero rows**, not
an error. A denial on INSERT surfaces as an error (42501); a denial on
UPDATE/DELETE surfaces as **zero affected rows**, because the row is invisible
to the writer in the first place.

Denial assertions check for code **42501** specifically, not merely "an error".
PostgREST answers a call to a missing *or* renamed function with `PGRST202`, so
`expect(error).not.toBeNull()` would keep passing after someone deleted the
thing under test.

A few assertions go around PostgREST entirely and read the catalog over a direct
Postgres connection (`tests/integration/helpers/sql.ts`): trigger functions are
never exposed as RPCs — even to `service_role`, which holds EXECUTE — so their
grants can only be checked with `has_function_privilege`. The same helper backs
a sweep asserting **RLS is enabled on every public table**, which is what makes
the blanket table grants below safe.

Fixtures (`tests/integration/helpers/supabase.ts`) create real auth users via
the admin API and sign each one in, so tests run as the `authenticated` role
with a genuine `auth.uid()`. `cleanup()` unwinds in FK-safe order — drafts,
then groups, then users.

### group_members self-join

The suite once carried a `KNOWN GAP` test: `group_members_insert` allowed
`user_id = auth.uid()` unconditionally, so any authenticated user who knew a
group's UUID could add themselves to it. Closed 2026-07-21 by
`20260721000200_restrict_group_members_insert.sql`. The self-insert clause is
now scoped to the one caller that needed it — `createGroup` seeding the
creator's own `admin` row — via `groups.created_by = auth.uid() AND role =
'admin'`. Everything else goes through `is_group_admin()`, or through
`accept_group_invite` (SECURITY DEFINER, bypasses RLS). The `group_members`
describe block asserts both directions.

## E2E Suite

`tests/e2e/draft-flow.spec.ts` — Playwright, run with `npm run test:e2e`.

One test covering the full happy path: sign in → configure a simulated draft →
pick every card of all three packs → deck builder → submit → results. It runs
against a **production build** of the app (`next build` + `next start`, wired up
by `playwright.config.ts`'s `webServer`) pointed at the local Supabase, so
Server Actions, `applyDraftMutation`'s version guard, bot picks, the
`get_draft_pick_view` RPC, and the deck submit path are all exercised for real.

**Why cube format.** Cube packs are built from a pasted card list
(`generateCubePacks`), so the run needs no `booster_products` rows and makes no
Scryfall calls. A booster draft would make the suite depend on the network and
on data CI has no copy of. `hydrateCardTypeLines` already skips `cube-` ids, so
this is a supported offline path rather than a test-only shortcut.

**Shape of the run**: 2 players (one human, one bot), 3 packs × 14 cards = 42
picks. Bots pick inside the same `applyDraftMutation` as the human, so each pick
resolves in one round-trip and the whole test lands around 13 seconds.

`retries` is deliberately **0**. This suite is the flake signal for the draft
flow; a retry would hide the intermittency it exists to detect. On failure,
Playwright keeps a trace and a video under `test-results/` (uploaded as a CI
artifact) — open one with `npx playwright show-trace <path>`.

The only test hook in application code is `data-testid="pick-grid"` on the
desktop card grid in `PickScreen.tsx`. Everything else is addressed by role and
accessible name, which doubles as a smoke test of the a11y work.

## Running Tests

| Command | Behavior |
|---------|----------|
| `npm test` | One-shot run (`vitest run`) — what CI uses |
| `npm run test:watch` | Watch mode (`vitest`) for local iteration |
| `npm run test:rls` | RLS integration suite. Requires `npx supabase start` first |
| `npm run test:e2e` | Playwright E2E. Requires `npx supabase start` first; builds and starts the app itself |
| `npm run test-packs` | **Not Vitest.** Runs `scripts/test-packs.ts` against production booster data + Scryfall; uses `PROD_SUPABASE_URL` / `PROD_SUPABASE_SECRET_KEY` from `.env.local` |

CI runs `npm test` as the last step of the `ci` job in
`.github/workflows/ci.yml` (after lint and build); `test:rls` and `test:e2e`
run in the separate `integration` job. The unit suite needs no env vars and no
live services — it's all in-process, with Supabase and Upstash stubbed out.

### Local setup for the integration suites

```bash
npx supabase start        # once; leave it running
npm run test:rls
npm run test:e2e          # first run also installs nothing — see below
```

Playwright's browser is a one-time install: `npx playwright install chromium`.

Neither suite needs configuration. `tests/integration/helpers/env.ts` shells out
to `supabase status -o env` and derives the URL and keys from there, so a stack
on non-default ports still works. To point the suites somewhere else, set all
four of `SUPABASE_TEST_URL`, `SUPABASE_TEST_PUBLISHABLE_KEY`,
`SUPABASE_TEST_SECRET_KEY`, and `SUPABASE_TEST_DB_URL` — the CLI is only
consulted when one of them is missing, so a partial override still needs
`supabase status` to work.

It deliberately prefers the **legacy JWT** anon/service-role keys over the local
stack's `sb_publishable_*` / `sb_secret_*` pair: locally those do not map onto
the `anon` / `service_role` Postgres roles, and role mapping is exactly what the
RLS suite measures. Production uses the new format; the role behavior under test
is identical.

### One way the CI database still differs from prod

The grants migration deliberately sets default privileges for **tables and
sequences only**. Prod additionally has default privileges granting EXECUTE on
public-schema *functions* to `anon`, `authenticated`, and `service_role` —
reproducing that here would re-grant EXECUTE on the SECURITY DEFINER helpers
that `20260717000000_harden_function_privileges.sql` revoked, which is the
opposite of what we want. Two consequences to keep in mind:

- A **new** SECURITY DEFINER function will be anon-executable in prod but not on
  the CI stack. A "denies anon EXECUTE" test can therefore pass in CI and be
  false in production. Any new function must carry its own explicit
  `GRANT`/`REVOKE` lines in the migration that creates it — don't rely on
  inherited defaults in either direction.
- `service_role` likewise gets no EXECUTE by default here, so a new RPC called
  from `supabase-admin.ts` will fail in CI while working in prod unless the
  migration grants it.

> Two things had to be fixed before `npx supabase start` produced a usable
> database at all, both committed with the suite: `supabase/seed.sql` still
> inserted into the long-dropped `invites` table (which aborted startup), and
> the API-role table grants that prod and staging have were never captured in a
> migration (`20260721000100_grant_api_role_table_privileges.sql`). A schema
> built from `supabase/migrations/` alone used to come up with no table access
> at all.

`test-packs` flags worth knowing: `--set <code>` (single set), `--db-only` (skip Scryfall), `--packs <n>` (default 24), `--verbose` (show passing products in summary).

## Fixtures and Mocks

The pure-logic files build their own minimal inputs (mostly `CardReference`-shaped objects literal-constructed in the test) and exercise the functions directly — no fixtures needed.

The non-pure files share one harness: `src/lib/__tests__/supabase-mock.ts`, a hand-rolled PostgREST/`redirect` double used by the draft-mutation, server-action, and route tests. `kv.test.ts` stands alone, mocking `@upstash/redis` and re-importing `kv.ts` per test because the module memoizes its client.

The integration and E2E suites use no mocks at all — real Postgres, real
policies, real auth, real browser. That is a deliberate rule, not an accident:
past mock-vs-prod divergence has masked broken migrations, so anything that
tests schema or policy behavior must hit a real Supabase.

## Coverage Gaps

From the April 2026 audit (`CODEBASE_AUDIT_2026-04-25.md` §7), in priority order:

1. ~~**`applyDraftMutation` concurrency control**~~ — closed 2026-07-21 by `draft-mutation.test.ts` (19 tests).
2. ~~**RLS policy regression tests**~~ — closed 2026-07-21 by `tests/integration/rls.test.ts` (60 tests).
3. ~~**Server actions auth/membership**~~ — closed 2026-07-21 by `dashboard/groups/__tests__/actions.test.ts` (18 tests).
4. ~~**End-to-end coverage**~~ — closed 2026-07-21 by `tests/e2e/draft-flow.spec.ts`.

Still uncovered:

- **Realtime.** The E2E run has Realtime available but does not depend on it —
  bot picks resolve inside the same mutation, and the waiting-screen poll is a
  sufficient fallback. A dropped subscription would not fail any test.
- **Multi-human drafts.** The E2E path uses one human and one bot. Seat passing
  between two real sessions, the lobby, and join/leave are unexercised.
- **Winston and booster-set formats end to end.** Both have unit coverage;
  neither has a browser path (booster packs would require network + fixture
  data).
- **The React layer generally** — only the components the happy path walks
  through are touched, and only for the states it happens to hit.

The four uncovered `await res.json()`-without-`res.ok` fetch sites (audit §1.5) are also a candidate for component-level tests once a `fetchJson()` helper is in place.
