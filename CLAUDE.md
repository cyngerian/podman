# CLAUDE.md

Guidance for Claude Code when working with this repository.

## Commands

**Local dev** (run these during development):
```bash
npm run dev          # Next.js dev server (localhost:3000)
npm test             # Vitest unit tests (draft engine) — run when touching engine logic
npm run test:watch   # Vitest in watch mode
npm run test-packs   # Validate pack generation across all sets (uses PROD_ vars from .env.local)
npx supabase start   # Local Supabase (API :54321, DB :54322)
```

**Data management** (run manually as needed):
```bash
npm run backup-prod   # Backup production data to backups/ (run before merging PRs)
npm run sync-staging  # Sync prod schema + data to staging
npm run restore-prod  # Restore production from a backup (accepts optional backup dir path)
npm run update-sets   # Detect and load new MTG sets into DB + invalidate KV cache
```

**CI-only** (GitHub Actions runs these on every PR — do NOT run locally):
```bash
npm run build        # Production build (type-checks included)
npm run lint         # ESLint
```

## Deployment Workflow

All changes go through PRs so CI validates before merge. **NEVER commit or push directly to `main`** — always create a feature branch first. If you accidentally commit to `main`, immediately move it to a branch: `git branch <name> && git reset --hard HEAD~1`.

1. Create a feature branch: `git checkout -b branch-name`
2. Make changes, commit to the branch
3. Push and open a PR: `git push -u origin branch-name` → `gh pr create`
4. Wait for CI (lint + build + test) to pass
5. **Test on PR preview URL** — Vercel auto-deploys every PR with staging Supabase env vars. Find the preview link in the Vercel bot comment on the PR.
6. **Run `npm run backup-prod`** before merging
7. Merge the PR: `gh pr merge`
8. Verify Vercel production deploy on `www.podman.app`
9. Switch back and pull: `git checkout main && git pull`
10. Delete the branch: `git branch -d branch-name && git push origin --delete branch-name`

**Branches**: `main` = production (`www.podman.app`). Vercel auto-deploys previews (with staging Supabase env vars) on every PR push, and production on merge to `main`. Preview URLs are permanent — they stay live even after the PR is merged.

## Architecture

MTG (Magic: The Gathering) draft web app. Players open packs, pick cards in timed rounds, pass packs to the next player. Supports 8-player standard draft, 2-player Winston, and cube formats.

**Stack**: Next.js 16 (App Router) + React 19 + TailwindCSS 4 + Supabase (Postgres + Auth + Realtime) + Vercel. **Path alias**: `@/*` → `./src/*`

### Routes

- `/auth/*` — login, signup, signout (public)
- `/(app)/dashboard/*` — group management, draft proposals (auth-protected via middleware)
- `/(app)/dashboard/profile` — user profile edit (avatar, bio, favorite color)
- `/(app)/dashboard/simulate` — configure and start simulated drafts against bots
- `/(app)/draft/[draftId]/*` — draft flow: lobby → pick → deck-build → results
- `/(app)/crack-a-pack` — standalone pack opening (any booster type)
- `/invite/[token]` — public group invite landing page (middleware allowlist: `/auth` + `/invite`)
- `/api/sets`, `/api/boosters?set={code}` — public APIs (cached 24h)
- `/api/avatar` — POST avatar image upload via `@vercel/blob`

**Layout files:** `src/app/layout.tsx` is the root layout (HTML shell, metadata exports, Sentry). `src/app/(app)/layout.tsx` is the app shell (sticky header, user avatar, sign out). These are different files — metadata goes in the root layout, JSX/header changes go in the app layout.

The `(app)` layout adds a sticky header (`z-30`, `h-12`) with user avatar, display name, and sign out. Content constrained to `max-w-5xl`. The pick screen uses `fixed inset-0 z-40` to overlay this header.

### Supabase Clients

1. **Browser** (`src/lib/supabase.ts`) — client components, Realtime subscriptions. Uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
2. **Server** (`src/lib/supabase-server.ts`) — server components and actions. Cookie-based session. `getUser()` memoized via `React.cache()`.
3. **Admin** (`src/lib/supabase-admin.ts`) — server actions only. Uses `SUPABASE_SECRET_KEY`, bypasses RLS. Required for draft state mutations.

### Draft Engine (`src/lib/draft-engine.ts`)

Pure functions transforming immutable `Draft` state objects. Key functions: `createDraft`, `startDraft`, `makePickAndPass`, `advanceToNextPack`, `transitionToDeckBuilding`, `unsubmitDeck`. State stored as JSON in `drafts.state`, mutated via `applyDraftMutation()` with optimistic concurrency. **117 unit tests** across `src/lib/__tests__/` (Vitest): 88 draft engine, 12 scryfall normalization, 17 export functions.

### Key Types (`src/lib/types.ts`)

`Draft`, `DraftSeat`, `PackState`, `CardReference` (minimal card data — never full Scryfall objects). Optional fields on `CardReference`: `typeLine` (missing on pre-Feb 2026 drafts, hydrated at page load), `backImageUri`/`backSmallImageUri` (DFCs only). `DraftSeat.deckName` persisted via auto-save. `PodMemberStatus` includes `avatarUrl`, `favoriteColor`, `isCurrentUser`.

### Realtime

`useRealtimeChannel` hook wraps Supabase channel lifecycle. `PickClient.tsx` subscribes to draft table changes — `router.refresh()` pulls fresh server data on any pick.

## Key Patterns

### Server Actions

Return `{ error: string }` on failure or `void`/redirect on success. Auth check at top. Draft mutations use admin client. Actions modifying group resources must check membership/role explicitly before DB ops — don't rely solely on RLS (see `updateGroupEmoji` as model pattern).

### Security

- **Open redirect prevention**: Login/signup `redirect` param validated to start with `/` and not `//`
- **Security headers**: `next.config.ts` sets X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, Permissions-Policy, Content-Security-Policy-Report-Only
- **Membership checks**: All server actions that modify group resources verify membership explicitly before DB ops (PR #20)
- **Avatar upload validation**: MIME-type allowlist (JPEG, PNG, GIF, WebP, AVIF), not filename-based (PR #20)
- **RPC search_path**: All SECURITY DEFINER functions use `SET search_path = ''` (PR #20)
- **Atomic auto-confirm**: `voteOnProposal` uses `.eq("status", "open")` to prevent TOCTOU races
- **Defense-in-depth**: Server actions check authorization explicitly even though RLS would also block
- **Error monitoring**: Sentry (`@sentry/nextjs`) captures client, server, and edge errors. Global error boundary in `src/app/global-error.tsx`. Client init in `src/instrumentation-client.ts` (Turbopack-compatible), server/edge via `src/instrumentation.ts`, tunnel route `/monitoring` bypasses ad blockers.

### Accessibility

- **Focus traps**: `useFocusTrap` hook (`src/hooks/useFocusTrap.ts`) — saves active element, focuses first child on open, traps Tab/Shift+Tab, restores focus on close. Applied to all 5 modals/overlays (PickScreen desktop preview + grid view + deck builder, DeckBuilderScreen preview, PostDraftScreen preview, PodStatusOverlay).
- **Keyboard access**: LongPressPickButton supports Enter/Space hold + Escape cancel. Scrub bar has `role="slider"` with arrow keys, Home/End. Filter buttons have `aria-label` + `aria-pressed`.
- **ARIA**: Dialog roles on all overlays. `aria-hidden` on decorative mana icons. Scrub bar ARIA values synced in `useCarousel` `updateVisuals()`.
- **Skip-to-content**: `sr-only` link in app layout, visible on focus, jumps to `#main-content`.

### Database & RLS

Supabase Postgres with RLS. Key tables: `profiles`, `groups`, `group_members`, `group_invites`, `draft_proposals`, `draft_players`, `drafts`. RLS policies on `group_members`/`draft_players` use SECURITY DEFINER helpers (`user_group_ids()`, `user_draft_ids()`, `is_group_admin()`) to avoid infinite recursion.

### Migrations

**All schema changes MUST go through migration files** in `supabase/migrations/`. Never apply schema changes directly via MCP tools (Supabase `execute_sql`, `apply_migration`) or the dashboard — those are not reproducible and cannot be tracked.

**Naming**: `YYYYMMDDHHMMSS_description.sql` — the numeric prefix before the first `_` must be unique across all files (Supabase uses it as the version key). Use `YYYYMMDD000000` for the first migration of a day, `YYYYMMDD000100` for the second, etc.

**Applying migrations**:
```bash
# Linked to prod by default. Dry-run first, then push:
npx supabase db push --dry-run
npx supabase db push

# To push to staging instead, re-link first:
npx supabase link --project-ref gotytvqikkwmrsztojgf
npx supabase db push
npx supabase link --project-ref mvqdejniqbaiishumezl  # re-link back to prod
```

**Rules**:
- Migration files must be idempotent where possible (use `IF NOT EXISTS`, `IF EXISTS`, `CREATE OR REPLACE`, etc.)
- Never modify an already-applied migration — create a new one instead
- After applying, verify with `npx supabase migration list` — Local and Remote columns should match

### Card Images & DFCs

Remote from Scryfall (`cards.scryfall.io`), optimized via Next.js Image. Rate-limited client in `src/lib/scryfall.ts` (75ms interval, 10 req/s). `CardReference` stores `imageUri`/`smallImageUri` + optional `backImageUri`/`backSmallImageUri` for DFCs. Colors unioned from all faces via `dfcUnionColors()`. Flip interaction on carousel, desktop preview, and deck builder modal.

**Collector number normalization**: `normalizeForScryfall()` handles DFC `a`/`b` suffixes, star `★` suffixes, and "The List" `SET-NUM` format. `fetchCardsByCollectorNumber` sends both original and normalized to Scryfall. See `docs/collector-number-suffix-fix.md`.

**Booster data caching**: `booster-data.ts` uses a three-layer cache: L1 module-level Map → L2 Upstash Redis (`src/lib/kv.ts`) → L3 Postgres RPC (`get_booster_product_json`). Warm-up triggers fire on Crack a Pack product selection and draft lobby load.

**Booster data updates**: `scripts/load-booster-data.ts` loads data from `taw/magic-sealed-data`. Flags: `--sync` (detect+load new products only), `--set <code>` (filter to one set), `--clear` (wipe before load). All load paths invalidate Upstash Redis `booster:*` keys. GitHub Actions workflow `update-sets.yml` runs `--sync` daily at 10:00 UTC against both prod and staging.

## Features

### Pick Screen (`src/components/draft/PickScreen.tsx`)

**Mobile**: Pure transform carousel via `useCarousel` hook (`src/hooks/useCarousel.ts`) — touch handlers, rAF physics loop, DOM ref management. Cards 72vw, active `scale(1.15)`, inactive `scale(0.55)`. Long-press pick button (500ms, also keyboard-accessible via Enter/Space hold), scrub bar (keyboard-navigable with arrow keys), grid view overlay.

**Desktop**: Two-row header + grid (`grid-cols-3 lg:4 xl:4`, `max-w-5xl`). Row 2 has inline filter pills. Split by `sm:hidden`/`hidden sm:flex`. Click card → centered modal (`fixed inset-0 z-50`) with large image, card name, flip (DFC), and PICK button.

**Filters**: Multi-select `Set<PackFilterValue>`. Color OR + type AND; creature/non-creature mutually exclusive.

**Dependencies**: `mana-font`, `keyrune`, `@vercel/blob`

### Deck Builder (`src/components/deck-builder/DeckBuilderScreen.tsx`)

3-col mobile / 5-col tablet / 7-col desktop. Tap card for magnified preview modal. Desktop hover → floating 250px magnified preview (hidden when click modal open). Collapsible sideboard. Auto-save (1s debounce). Sections: Color Breakdown, Basic Lands (suggest 17), Card Types, Mana Curve.

**Mid-draft mode** (`mode="midDraft"`): hides lands/submit/deck name. "My Deck" overlay (`fixed inset-0 z-50`). Auto-adds newly picked cards via `knownPoolIdsRef` effect. Reconciles `initialDeck` vs `pool` on mount.

### Results (`src/components/draft/PostDraftScreen.tsx`)

Deck/sideboard/pool grids, pick history, per-player picks (accordion with avatars). Export: clipboard, .cod, .txt — all honor `deckName`. "Edit Deck" → `unsubmitDeck()` → back to deck builder. Click card → magnified modal (mobile + desktop). Desktop hover → floating 250px preview.

### Profiles

`profiles` table: `display_name`, `avatar_url` (emoji or Vercel Blob URL), `bio`, `favorite_color`. `UserAvatar` component renders image/emoji/first-letter fallback. Sizes: `sm`/`md`/`lg`. Upload via `/api/avatar` → `@vercel/blob`. Avatars displayed everywhere usernames appear: app header, dashboard, group members, proposal voters, lobby seats, pod status, results accordion.

### Groups

`groups` table: `name`, `emoji` (optional, displays left of name at larger size), `description`, `created_by`. Inline emoji edit for admins via `GroupEmojiEditor`. Faint `border-border/40` dividers between sections.

**Invite links**: `group_invites` table with UUID tokens, 7d expiry. RPCs: `accept_group_invite` (authenticated), `get_invite_info` (anon). Unauthed users see signup/login with redirect. Admin section for generate/copy/revoke.

### Simulated Drafts

`/dashboard/simulate` — configure format/set/players, start vs bots. Bots use rarity-first → color-commit algorithm. Bot picks run inside `applyDraftMutation`. `drafts.group_id` nullable, `drafts.is_simulated` boolean. Winston bots via `botWinstonDecision`.

### Crack a Pack (`src/app/(app)/crack-a-pack/`)

Standalone pack opening. `/api/boosters?set={code}` returns products filtered to user-relevant types. `generatePacksForSet` accepts optional `{ productCode?, keepBasicLands? }`. Basic lands kept (not stripped).

### Pod Screen (`src/components/draft/PodMemberList.tsx`)

Players sorted by seat with avatars, pick counts, direction arrows (↓ left/↑ right), wrap-around indicator. Current user: accent ring + "(you)". Picking: green ring. Profiles fetched in `pick/page.tsx` via parallel query.

## Constraints

- **Header height**: All headers with "podman" must use `h-12` + `items-center`. Using `py-3` causes vertical shift across page transitions.
- **Carousel py-8**: Must not be reduced — active card's 1.15x scale needs vertical overflow room.
- **Carousel marginTop**: Currently -10px. Do not change without user approval.
- **Carousel responsive sizing**: Card width uses `min(72vw, 400px, calc((100cqh - 80px) * 488/680))` with `container-type: size` on the carousel container. Cards shrink on shorter viewports (Safari with browser chrome) while staying full size in PWA mode.
- **Overlay width**: `fixed inset-0` overlays span full viewport. Add `max-w-5xl mx-auto w-full` to content inside, not on the fixed wrapper.
- **Don't share app header with draft overlay**: Draft's `fixed z-40` overlays `sticky z-30` header. Duplicate the header instead.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY   # sb_publishable_* format
SUPABASE_SECRET_KEY                     # sb_secret_* format
BLOB_READ_WRITE_TOKEN                   # Vercel Blob store (avatar uploads)
NEXT_PUBLIC_SENTRY_DSN                  # Sentry error monitoring DSN
SENTRY_ORG                              # Sentry org slug (for source maps)
SENTRY_PROJECT                          # Sentry project slug
SENTRY_AUTH_TOKEN                       # Sentry auth token (for source maps)
UPSTASH_REDIS_REST_URL                  # Upstash Redis URL (booster data cache)
UPSTASH_REDIS_REST_TOKEN                # Upstash Redis token (booster data cache)
SUPABASE_PROJECT_REF                    # Production project ref (scripts)
SUPABASE_STAGING_REF                    # Staging project ref (sync-staging)
SUPABASE_ACCESS_TOKEN                   # Supabase personal access token (scripts)
```

## Pending Work

`CODEBASE_REVIEW.md` at project root contains a verified implementation plan (Feb 2026) — 30 issues, 7 PRs, 3 waves. All 3 waves complete (PRs #20–27, merged). Rarity sort fix in PR #28.
