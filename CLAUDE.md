# CLAUDE.md

Guidance for Claude Code when working with this repository.

## Commands

**Local dev** (run these during development):
```bash
npm run dev          # Next.js dev server (localhost:3000)
npm test             # Vitest unit tests (draft engine) — run when touching engine logic
npm run test:watch   # Vitest in watch mode
npm run test-packs   # Validate pack generation across all sets (requires .env.prod)
npx supabase start   # Local Supabase (API :54321, DB :54322)
```

**CI-only** (GitHub Actions runs these on every PR — do NOT run locally):
```bash
npm run build        # Production build (type-checks included)
npm run lint         # ESLint
```

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

The `(app)` layout adds a sticky header (`z-30`, `h-12`) with user avatar, display name, and sign out. Content constrained to `max-w-5xl`. The pick screen uses `fixed inset-0 z-40` to overlay this header.

### Supabase Clients

1. **Browser** (`src/lib/supabase.ts`) — client components, Realtime subscriptions. Uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
2. **Server** (`src/lib/supabase-server.ts`) — server components and actions. Cookie-based session. `getUser()` memoized via `React.cache()`.
3. **Admin** (`src/lib/supabase-admin.ts`) — server actions only. Uses `SUPABASE_SECRET_KEY`, bypasses RLS. Required for draft state mutations.

### Draft Engine (`src/lib/draft-engine.ts`)

Pure functions transforming immutable `Draft` state objects. Key functions: `createDraft`, `startDraft`, `makePickAndPass`, `advanceToNextPack`, `transitionToDeckBuilding`, `unsubmitDeck`. State stored as JSON in `drafts.state`, mutated via `applyDraftMutation()` with optimistic concurrency. **88 unit tests** in `src/lib/__tests__/draft-engine.test.ts` (Vitest).

### Key Types (`src/lib/types.ts`)

`Draft`, `DraftSeat`, `PackState`, `CardReference` (minimal card data — never full Scryfall objects). Optional fields on `CardReference`: `typeLine` (missing on pre-Feb 2026 drafts, hydrated at page load), `backImageUri`/`backSmallImageUri` (DFCs only). `DraftSeat.deckName` persisted via auto-save. `PodMemberStatus` includes `avatarUrl`, `favoriteColor`, `isCurrentUser`.

### Realtime

`useRealtimeChannel` hook wraps Supabase channel lifecycle. `PickClient.tsx` subscribes to draft table changes — `router.refresh()` pulls fresh server data on any pick.

## Key Patterns

### Server Actions

Return `{ error: string }` on failure or `void`/redirect on success. Auth check at top. Draft mutations use admin client. Actions modifying group resources must check membership/role explicitly before DB ops — don't rely solely on RLS (see `updateGroupEmoji` as model pattern).

### Security

- **Open redirect prevention**: Login/signup `redirect` param validated to start with `/` and not `//`
- **Security headers**: `next.config.ts` sets X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, Permissions-Policy
- **Atomic auto-confirm**: `voteOnProposal` uses `.eq("status", "open")` to prevent TOCTOU races
- **Defense-in-depth**: Server actions check authorization explicitly even though RLS would also block
- **Error monitoring**: Sentry (`@sentry/nextjs`) captures client, server, and edge errors. Global error boundary in `src/app/global-error.tsx`. Client init in `src/instrumentation-client.ts` (Turbopack-compatible), server/edge via `src/instrumentation.ts`, tunnel route `/monitoring` bypasses ad blockers.

### Database & RLS

Supabase Postgres with RLS. Key tables: `profiles`, `groups`, `group_members`, `group_invites`, `draft_proposals`, `draft_players`, `drafts`. RLS policies on `group_members`/`draft_players` use SECURITY DEFINER helpers (`user_group_ids()`, `user_draft_ids()`, `is_group_admin()`) to avoid infinite recursion.

### Card Images & DFCs

Remote from Scryfall (`cards.scryfall.io`), optimized via Next.js Image. Rate-limited client in `src/lib/scryfall.ts` (75ms interval, 10 req/s). `CardReference` stores `imageUri`/`smallImageUri` + optional `backImageUri`/`backSmallImageUri` for DFCs. Colors unioned from all faces via `dfcUnionColors()`. Flip interaction on carousel, desktop preview, and deck builder modal.

**Collector number normalization**: `normalizeForScryfall()` handles DFC `a`/`b` suffixes, star `★` suffixes, and "The List" `SET-NUM` format. `fetchCardsByCollectorNumber` sends both original and normalized to Scryfall. See `docs/collector-number-suffix-fix.md`.

**Sheet cards loading**: `booster-data.ts` fetches per-sheet (one query per sheet_id) to avoid PostgREST's 1000-row server cap.

## Features

### Pick Screen (`src/components/draft/PickScreen.tsx`)

**Mobile**: Pure transform carousel — `overflow-hidden`, `touch-action: none`, wrapper moves via `translate3d`. Cards 72vw, active `scale(1.15)`, inactive `scale(0.55)`. rAF loop with zero React re-renders. Long-press pick button (500ms), scrub bar, grid view overlay.

**Desktop**: Two-row header + grid (`grid-cols-3 lg:4 xl:4`, `max-w-5xl`). Row 2 has inline filter pills. Split by `sm:hidden`/`hidden sm:flex`.

**Filters**: Multi-select `Set<PackFilterValue>`. Color OR + type AND; creature/non-creature mutually exclusive.

**Dependencies**: `mana-font`, `keyrune`, `@vercel/blob`

### Deck Builder (`src/components/deck-builder/DeckBuilderScreen.tsx`)

3-col mobile / 5-col tablet / 7-col desktop. Tap card for magnified preview modal. Collapsible sideboard. Auto-save (1s debounce). Sections: Color Breakdown, Basic Lands (suggest 17), Card Types, Mana Curve.

**Mid-draft mode** (`mode="midDraft"`): hides lands/submit/deck name. "My Deck" overlay (`fixed inset-0 z-50`). Auto-adds newly picked cards via `knownPoolIdsRef` effect. Reconciles `initialDeck` vs `pool` on mount.

### Results (`src/components/draft/PostDraftScreen.tsx`)

Deck/sideboard/pool grids, pick history, per-player picks (accordion). Export: clipboard, .cod, .txt — all honor `deckName`. "Edit Deck" → `unsubmitDeck()` → back to deck builder.

### Profiles

`profiles` table: `display_name`, `avatar_url` (emoji or Vercel Blob URL), `bio`, `favorite_color`. `UserAvatar` component renders image/emoji/first-letter fallback. Sizes: `sm`/`md`/`lg`. Upload via `/api/avatar` → `@vercel/blob`.

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
```
