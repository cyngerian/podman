# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Next.js dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint (eslint command, no src/ arg needed)
npx supabase start   # Local Supabase (API :54321, DB :54322)
```

No test framework is configured.

## Architecture

MTG (Magic: The Gathering) draft web app. Players open packs, pick cards in timed rounds, pass packs to the next player. Supports 8-player standard draft, 2-player Winston, and cube formats.

**Stack**: Next.js 16 (App Router) + React 19 + TailwindCSS 4 + Supabase (Postgres + Auth + Realtime) + Vercel

**Path alias**: `@/*` maps to `./src/*`

### Route Structure

- `/auth/*` — login, signup, signout (public)
- `/(app)/dashboard/*` — group management, draft proposals (auth-protected via middleware)
- `/(app)/dashboard/profile` — user profile edit page (avatar, bio, favorite color)
- `/(app)/draft/[draftId]/*` — draft flow: lobby → pick → deck-build → results
- `/api/sets` — public API (cached 24h)
- `/api/avatar` — POST avatar image upload via `@vercel/blob`

The `(app)` layout adds a sticky header (`z-30`, `h-12`) with user avatar, display name, and sign out. Content constrained to `max-w-5xl`. The pick screen uses `fixed inset-0 z-40` to overlay this header.

### Three Supabase Clients

1. **Browser** (`src/lib/supabase.ts`) — client components, Realtime subscriptions. Uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
2. **Server** (`src/lib/supabase-server.ts`) — server components and server actions. Cookie-based session.
3. **Admin** (`src/lib/supabase-admin.ts`) — server actions only. Uses `SUPABASE_SECRET_KEY`, **bypasses RLS**. Required for draft state mutations since host needs to modify all seats atomically.

### Draft Engine (`src/lib/draft-engine.ts`)

All draft logic is pure functions that transform immutable `Draft` state objects. Key functions: `createDraft`, `startDraft`, `makePickAndPass`, `advanceToNextPack`, `transitionToDeckBuilding`, `unsubmitDeck`. Draft state is stored as JSON in the `drafts.state` column and mutated via `applyDraftMutation()` in server actions with optimistic concurrency.

### Key Types (`src/lib/types.ts`)

`Draft`, `DraftSeat`, `PackState`, `CardReference` (minimal card data cached in draft state — never store full Scryfall objects). `TimerPreset` controls pick speed via lookup table + multiplier. `PackFilterValue` for multi-select filters (`Set<PackFilterValue>`), `PickedCardSortMode` for UI sorting. `CardReference.typeLine` is optional — missing on drafts created before Feb 2026; hydrated at page load via Scryfall collection endpoint. `DraftSeat.deckName` is optional — persisted via auto-save and used in exports. `PodMemberStatus` includes `avatarUrl`, `favoriteColor`, `isCurrentUser` for the pod screen.

### Realtime Updates

`useRealtimeChannel` hook (`src/hooks/useRealtimeChannel.ts`) wraps Supabase channel lifecycle. `PickClient.tsx` subscribes to draft table changes — when any player picks, all clients get notified and `router.refresh()` pulls fresh server data.

### Server Actions Pattern

Server actions return `{ error: string }` on failure or `void`/redirect on success. Auth check at top of every action. Draft mutations use the admin client.

### Card Images

Remote from Scryfall (`cards.scryfall.io`), optimized via Next.js Image. `CardReference` stores both `imageUri` (normal) and `smallImageUri` (thumbnail). Rate-limited Scryfall client in `src/lib/scryfall.ts` (75ms interval, 10 req/s max).

## Database

Supabase Postgres with RLS. Key tables: `profiles`, `groups`, `group_members`, `group_invites`, `draft_proposals`, `draft_players`, `drafts`.

**RLS gotcha**: Policies on `group_members`/`draft_players` that reference their own table cause infinite recursion. Use SECURITY DEFINER helper functions (`user_group_ids()`, `user_draft_ids()`, `is_group_admin()`) that bypass RLS instead.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY   # sb_publishable_* format (not legacy anon key)
SUPABASE_SECRET_KEY                     # sb_secret_* format (not legacy service_role)
BLOB_READ_WRITE_TOKEN                   # Vercel Blob store (for avatar uploads)
```

## User Profiles

`profiles` table: `display_name`, `avatar_url`, `bio`, `favorite_color` (W/U/B/R/G or null). Avatar can be an emoji string or a URL (Vercel Blob). `UserAvatar` component (`src/components/ui/UserAvatar.tsx`) renders URL images, emoji, or first-letter fallback. Sizes: `sm` (24px), `md` (32px), `lg` (64px).

## Header Height Constraint

**Critical**: All headers containing "podman" must use `h-12` to ensure identical vertical positioning across page transitions. The app layout header, mobile draft row 1, and desktop draft row 1 all use `h-12` + `items-center`. Using `py-3` or other padding instead causes vertical shift because `items-center` positions text based on the tallest flex sibling, which differs between pages (avatar height vs timer height).

## Mobile Carousel (`src/components/draft/PickScreen.tsx`)

Active development area. Pure transform carousel (Option C) — no native scroll. Container is `overflow-hidden` with `touch-action: none`, wrapper moves via `translate3d`. Cards 72vw, active `scale(1.15)`, inactive `scale(0.55)`. rAF polling loop with zero React re-renders during scroll. Desktop uses a grid layout (`grid-cols-3 lg:4 xl:4`, constrained to `max-w-5xl`), split by `sm:hidden` / `hidden sm:flex`.

Desktop has a two-row header: row 1 mirrors the app layout (podman + set info + timer), row 2 has pack/pick info + inline filter pills + picks button. Inline filters replaced the old bottom-bar popup.

**Critical**: `py-8` on the carousel wrapper must not be reduced — the active card's 1.15x scale needs vertical overflow room. Reducing to `py-4` causes visible clipping.

**Dependencies**: `mana-font` (mana symbol icons), `keyrune` (set symbol icons), `@vercel/blob` (avatar uploads). Pick button uses 500ms long-press with fill animation (`LongPressPickButton`). Filters are multi-select (`Set<PackFilterValue>`) with color OR + type AND logic; creature/non-creature are mutually exclusive.

## Deck Builder (`src/components/deck-builder/DeckBuilderScreen.tsx`)

3-col mobile / 5-col tablet / 7-col desktop card grid with `size="medium"`. Tap card to open magnified preview modal (85vw/400px) with move-to-sideboard/deck button. Collapsible sideboard (default collapsed) with "Move all to deck" (two-tap confirm). Auto-saves deck/sideboard/lands/deckName to DB via debounced (1s) `onDeckChange` callback. Deck name persisted in `DraftSeat.deckName`.

Sections: Color Breakdown (mana-font icons, `justify-between`), Basic Lands (mana symbol steppers + "Suggest lands" button computing 17 lands from deck color proportions), Card Types (creatures/other), Mana Curve.

### Mid-Draft Mode

`DeckBuilderScreen` has a `mode` prop: `"full"` (default, deck building phase) or `"midDraft"` (during active draft). In `midDraft` mode: hides lands section, submit/skip footer, deck name input. Header shows "My Deck" with Close button, `sticky top-0`. Root constrained to `max-w-5xl mx-auto` on desktop. New cards default to deck (not sideboard). A `useEffect` + `knownPoolIdsRef` detects newly picked cards and auto-adds them to deck. On mount, reconciles `initialDeck` with `pool` so cards picked between sessions appear.

Accessed via "My Deck" button on both `PickScreen` and `WaitingScreen` (replaced old `PickedCardsDrawer`). Overlay uses `fixed inset-0 z-50`. `saveDeckAction` allows saves during both `active` and `deck_building` draft status. Deck/sideboard state persists to `DraftSeat.deck`/`DraftSeat.sideboard` via auto-save, carried forward to the deck building phase.

## Pod Screen (`src/components/draft/PodMemberList.tsx`)

Shows all draft players sorted by seat position with real profile avatars (`UserAvatar`), pick counts, and picking status. Current user highlighted with accent ring + "(you)" label. Actively picking players get a green ring outline. SVG direction arrows between each player row indicate pack flow: `↓` for left pass (packs 1/3), `↑` for right pass (pack 2). Wrap-around indicator at bottom. Profile data (`avatar_url`, `favorite_color`) fetched in `pick/page.tsx` via parallel query alongside card hydration. Bots fall back to first-letter avatar (no profile row). Displayed directly on `WaitingScreen` and via `PodStatusOverlay` modal (triggered by clicking Pack:Pick in header).

## Results Screen (`src/components/draft/PostDraftScreen.tsx`)

Shows deck/sideboard/pool grids, creature stats, pick history (collapsible), per-player picks (accordion, all collapsed by default). Export: clipboard, Cockatrice (.cod), plain text (.txt) — all use `deckName` in content and filenames. "Edit Deck" button calls `editDeckAction` → `unsubmitDeck()` → redirects back to deck builder with state intact.
