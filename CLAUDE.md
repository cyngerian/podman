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
- `/(app)/draft/[draftId]/*` — draft flow: lobby → pick → deck-build → results
- `/api/sets` — public API (cached 24h)

The `(app)` layout adds a sticky header with user info. The pick screen uses `fixed inset-0 z-40` to overlay this header on mobile.

### Three Supabase Clients

1. **Browser** (`src/lib/supabase.ts`) — client components, Realtime subscriptions. Uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
2. **Server** (`src/lib/supabase-server.ts`) — server components and server actions. Cookie-based session.
3. **Admin** (`src/lib/supabase-admin.ts`) — server actions only. Uses `SUPABASE_SECRET_KEY`, **bypasses RLS**. Required for draft state mutations since host needs to modify all seats atomically.

### Draft Engine (`src/lib/draft-engine.ts`)

All draft logic is pure functions that transform immutable `Draft` state objects. Key functions: `createDraft`, `startDraft`, `makePickAndPass`, `advanceToNextPack`, `transitionToDeckBuilding`. Draft state is stored as JSON in the `drafts.state` column and mutated via `applyDraftMutation()` in server actions with optimistic concurrency.

### Key Types (`src/lib/types.ts`)

`Draft`, `DraftSeat`, `PackState`, `CardReference` (minimal card data cached in draft state — never store full Scryfall objects). `TimerPreset` controls pick speed via lookup table + multiplier. `PackFilterMode` and `PickedCardSortMode` for UI filtering.

### Realtime Updates

`useRealtimeChannel` hook (`src/hooks/useRealtimeChannel.ts`) wraps Supabase channel lifecycle. `PickClient.tsx` subscribes to draft table changes — when any player picks, all clients get notified and `router.refresh()` pulls fresh server data.

### Server Actions Pattern

Server actions return `{ error: string }` on failure or `void`/redirect on success. Auth check at top of every action. Draft mutations use the admin client.

### Card Images

Remote from Scryfall (`cards.scryfall.io`), optimized via Next.js Image. `CardReference` stores both `imageUri` (normal) and `smallImageUri` (thumbnail). Rate-limited Scryfall client in `src/lib/scryfall.ts` (75ms interval, 10 req/s max).

## Database

Supabase Postgres with RLS. Key tables: `profiles`, `groups`, `group_members`, `draft_proposals`, `draft_players`, `drafts`, `invites`.

**RLS gotcha**: Policies on `group_members`/`draft_players` that reference their own table cause infinite recursion. Use SECURITY DEFINER helper functions (`user_group_ids()`, `user_draft_ids()`, `is_group_admin()`) that bypass RLS instead.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY   # sb_publishable_* format (not legacy anon key)
SUPABASE_SECRET_KEY                     # sb_secret_* format (not legacy service_role)
```

## Mobile Carousel (`src/components/draft/PickScreen.tsx`)

Active development area. Uses a "flipped-scale" approach: cards are big by default (72vw), active card `scale(1.15)`, inactive shrink to `scale(0.55)`. GPU-composited via snap target / transform target separation (outer div for `scroll-snap-align`, inner div for `will-change-transform`). rAF polling loop with zero React re-renders during scroll — all scroll-linked UI updated via refs and direct DOM manipulation. Desktop uses a standard grid layout (split by `sm:hidden` / `hidden sm:flex`).

**CSS caveat**: Tailwind's `snap-mandatory` class uses a CSS variable that can fail — always use inline `scrollSnapType: "x mandatory"` instead.
