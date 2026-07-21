# Testing

<!-- last_updated: 2026-07-21 -->

## Overview

The test surface is **Vitest unit tests over pure logic** — the draft engine and its supporting libraries — plus a thin layer of server-action and route tests driven by hand-rolled Supabase doubles. As of this writing the suite is **308 tests across 15 files**, mostly in `src/lib/__tests__/`. Total runtime is well under a second.

There are no integration tests (no real Supabase, no Realtime, no auth), no end-to-end tests, and no UI/component tests. RLS policies and the React layer are uncovered by the automated suite — see [Coverage Gaps](#coverage-gaps).

A separate validation script, `scripts/test-packs.ts` (run via `npm run test-packs`), tests pack generation against the live booster_products data + Scryfall and is **not** part of the Vitest suite.

## Test Suites

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
| `.../dashboard/groups/__tests__/actions.test.ts` | 18 | Server-action auth/membership guards |
| `proposal-validation.test.ts` | 14 | Draft proposal input validation |
| `scryfall.test.ts` | 12 | Collector-number normalization (DFC `a/b`, `★`, "The List" `SET-NUM`) |
| `kv.test.ts` | 14 | Upstash wrapper: TTL passthrough (`ex`), no-TTL and unconfigured paths, error swallowing, booster 24h default |
| `deck-saver.test.ts` | 10 | Debounced deck auto-save |
| `src/app/api/avatar/__tests__/route.test.ts` | 9 | Avatar upload MIME allowlist and auth |
| `fetch-json.test.ts` | 6 | JSON fetch wrapper and `FetchJsonError` |
| `async-guard.test.ts` | 6 | Async guard helper |

The path alias `@/*` → `./src/*` is wired up in `vitest.config.ts`.

## Running Tests

| Command | Behavior |
|---------|----------|
| `npm test` | One-shot run (`vitest run`) — what CI uses |
| `npm run test:watch` | Watch mode (`vitest`) for local iteration |
| `npm run test-packs` | **Not Vitest.** Runs `scripts/test-packs.ts` against production booster data + Scryfall; uses `PROD_SUPABASE_URL` / `PROD_SUPABASE_SECRET_KEY` from `.env.local` |

CI runs `npm test` as the third step in `.github/workflows/ci.yml` (after lint and build). The unit suite needs no env vars and no live services — it's all in-process pure functions.

`test-packs` flags worth knowing: `--set <code>` (single set), `--db-only` (skip Scryfall), `--packs <n>` (default 24), `--verbose` (show passing products in summary).

## Fixtures and Mocks

The pure-logic files build their own minimal inputs (mostly `CardReference`-shaped objects literal-constructed in the test) and exercise the functions directly — no fixtures needed.

The non-pure files share one harness: `src/lib/__tests__/supabase-mock.ts`, a hand-rolled PostgREST/`redirect` double used by the draft-mutation, server-action, and route tests. `kv.test.ts` stands alone, mocking `@upstash/redis` and re-importing `kv.ts` per test because the module memoizes its client.

RLS policies, Realtime, and the React layer still have no coverage — there's no harness to stand a real Supabase up against.

> When integration-style tests are added (e.g. for migrations or RLS), they must hit a real Supabase rather than a mock — past mock-vs-prod divergence has masked broken migrations.

## Coverage Gaps

From the April 2026 audit (`CODEBASE_AUDIT_2026-04-25.md` §7), in priority order:

1. ~~**`applyDraftMutation` concurrency control**~~ — closed 2026-07-21 by `draft-mutation.test.ts` (19 tests).
2. **RLS policy regression tests** — the Feb 2026 migration that fixed infinite recursion in `group_members` policies has no test guarding it. Achievable via local Supabase + a small integration suite.
3. ~~**Server actions auth/membership**~~ — closed 2026-07-21 by `dashboard/groups/__tests__/actions.test.ts` (18 tests).
4. **End-to-end coverage** — a Playwright test for "create draft → 8 players join → pick all → submit → results" would catch full-stack regressions in ~200 lines / ~10 min runtime.

The four uncovered `await res.json()`-without-`res.ok` fetch sites (audit §1.5) are also a candidate for component-level tests once a `fetchJson()` helper is in place.
