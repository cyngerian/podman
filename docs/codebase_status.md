---
title: podman Codebase Status Report
status: active
last_verified: 2026-02-11
---

# podman Codebase Status Report

> [!IMPORTANT]
> **AI-Agent Context**: This document captures the current state of the podman codebase as of 2026-02-11. Use this as a reference when resuming work or onboarding a new session.

---

## Executive Summary

podman is a web app for organizing and running Magic: The Gathering drafts within friend groups. The project has a **complete frontend foundation** — all core draft logic, pack generation, and UI components are implemented as pure functions and React components. The **database schema is implemented** via Supabase (Postgres) with full RLS policies. **Auth, API routes, real-time sync, and page wiring remain.**

**Current state**: Frontend components complete, database schema deployed locally, not yet wired together.

---

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js (App Router) | 16.1.6 |
| Language | TypeScript | ^5 |
| UI | React | 19.2.3 |
| Styling | Tailwind CSS | ^4 |
| Hosting | Vercel | Planned |
| Database | Supabase (Postgres) | Local dev running |
| Auth | Supabase Auth | Schema ready, not wired |
| Real-time | Supabase Realtime | Planned |
| Card Data | Scryfall API | Live |

---

## Implementation Status

### Legend

| Indicator | Meaning |
|-----------|---------|
| ✅ | Complete, production-ready |
| ⚠️ | Scaffolded / partial |
| ❌ | Not started |

---

### Core Logic (`src/lib/`)

| File | Lines | Status | Description |
|------|-------|--------|-------------|
| [types.ts](file:///home/airbaggie/podman/src/lib/types.ts) | 228 | ✅ | Complete type system — enums, data models, Scryfall types, UI types. Includes `queuedCardId` on `DraftSeat`. |
| [draft-engine.ts](file:///home/airbaggie/podman/src/lib/draft-engine.ts) | 960 | ✅ | Pure state machine — standard, Winston, and cube draft lifecycle. Includes `queuePick`/`clearQueuedPick` for timer-expiry fallback. |
| [scryfall.ts](file:///home/airbaggie/podman/src/lib/scryfall.ts) | 373 | ✅ | Rate-limited Scryfall API client, CubeCobra import, error handling |
| [pack-generator.ts](file:///home/airbaggie/podman/src/lib/pack-generator.ts) | 335 | ✅ | Play Booster + Draft Booster templates, weighted rarity, cube packs |
| [export.ts](file:///home/airbaggie/podman/src/lib/export.ts) | 140 | ✅ | Clipboard copy, Cockatrice XML, plain text deck export |
| [supabase.ts](file:///home/airbaggie/podman/src/lib/supabase.ts) | 10 | ✅ | Browser Supabase client (uses `@supabase/ssr`) |
| [supabase-server.ts](file:///home/airbaggie/podman/src/lib/supabase-server.ts) | 24 | ✅ | Server-side Supabase client for App Router (cookie-based auth) |
| [database.types.ts](file:///home/airbaggie/podman/src/lib/database.types.ts) | 220 | ⚠️ | Hand-written placeholder — regenerate with `npx supabase gen types typescript` |

**Key design decisions**:
- Draft engine uses **immutable pure functions** (no side effects, easy to test)
- Scryfall client enforces **75ms minimum interval + 10 req/sec** rate limiting
- Pack templates are **extensible** — custom per-set distribution rules supported
- Card images are **never stored locally** — always fetched from Scryfall CDN

---

### UI Components (`src/components/`)

#### Draft Flow

| File | Lines | Status | Description |
|------|-------|--------|-------------|
| [CreateDraftForm.tsx](file:///home/airbaggie/podman/src/components/draft/CreateDraftForm.tsx) | 510 | ✅ | Draft creation wizard — format, set, players, pacing, timer |
| [DraftLobby.tsx](file:///home/airbaggie/podman/src/components/draft/DraftLobby.tsx) | 234 | ✅ | Pre-draft lobby — player list, invite link, start button |
| [PickScreen.tsx](file:///home/airbaggie/podman/src/components/draft/PickScreen.tsx) | 221 | ✅ | Main picking interface — card grid, filters, timer, preview |
| [PickedCardsDrawer.tsx](file:///home/airbaggie/podman/src/components/draft/PickedCardsDrawer.tsx) | 167 | ✅ | Full-screen drawer showing picked cards with sort modes |
| [BetweenPackScreen.tsx](file:///home/airbaggie/podman/src/components/draft/BetweenPackScreen.tsx) | 196 | ✅ | Pack intermission — color breakdown, recent picks, readiness |
| [WinstonDraftScreen.tsx](file:///home/airbaggie/podman/src/components/draft/WinstonDraftScreen.tsx) | 222 | ✅ | 2-player Winston draft — 3 piles, look/take/pass actions |
| [PostDraftScreen.tsx](file:///home/airbaggie/podman/src/components/draft/PostDraftScreen.tsx) | 252 | ✅ | Results — deck/sideboard grids, export, pick history |

#### Deck Builder

| File | Lines | Status | Description |
|------|-------|--------|-------------|
| [DeckBuilderScreen.tsx](file:///home/airbaggie/podman/src/components/deck-builder/DeckBuilderScreen.tsx) | 457 | ✅ | Deck construction — drag between zones, land stepper, mana curve, 40-card validation |

#### Shared UI

| File | Lines | Status | Description |
|------|-------|--------|-------------|
| [CardThumbnail.tsx](file:///home/airbaggie/podman/src/components/ui/CardThumbnail.tsx) | 61 | ✅ | Card image with WUBRG color border, foil indicator, click handlers |
| [CardPreview.tsx](file:///home/airbaggie/podman/src/components/ui/CardPreview.tsx) | 73 | ✅ | Large card preview modal with pick button |
| [Timer.tsx](file:///home/airbaggie/podman/src/components/ui/Timer.tsx) | 59 | ✅ | Countdown timer — green/yellow/red states, pulse animation |
| [ManaCurve.tsx](file:///home/airbaggie/podman/src/components/ui/ManaCurve.tsx) | 48 | ✅ | CMC distribution bar chart |

---

### App Router (`src/app/`)

| File / Route | Status | Description |
|--------------|--------|-------------|
| [layout.tsx](file:///home/airbaggie/podman/src/app/layout.tsx) | ✅ | Root layout — Geist fonts, metadata, dark theme viewport |
| [globals.css](file:///home/airbaggie/podman/src/app/globals.css) | ✅ | Design system — dark theme, MTG mana palette, animations |
| [page.tsx](file:///home/airbaggie/podman/src/app/page.tsx) | ❌ | Still default Next.js placeholder |
| `draft/` | ❌ | Empty directory — no `page.tsx` |
| `draft/[id]/` | ❌ | Empty directory — no `page.tsx` |
| `draft/new/` | ❌ | Empty directory — no `page.tsx` |
| `api/` | ❌ | Does not exist — no API routes |

---

### Design System (`globals.css`)

| Feature | Status |
|---------|--------|
| Dark theme with CSS variables | ✅ |
| MTG mana color palette (W/U/B/R/G + gold/colorless) | ✅ |
| Card aspect ratio utility (488:680) | ✅ |
| Drawer slide-in animation | ✅ |
| Timer pulse animation | ✅ |
| Mana curve bar styling | ✅ |
| Mobile optimizations (overscroll, no tap highlight) | ✅ |

---

## What Remains to Build

### Backend Infrastructure

| Component | Status | Notes |
|-----------|--------|-------|
| **Database schema** | ✅ | 8 tables, 17 indexes, 23 RLS policies. See [schema plan](file:///home/airbaggie/podman/docs/plans/supabase_schema.md). |
| **Local Supabase** | ✅ | Running on `127.0.0.1:54321`. `.env.local` configured. |
| **Supabase clients** | ✅ | Browser (`supabase.ts`) and server (`supabase-server.ts`) clients created. |
| **Database types** | ⚠️ | Hand-written placeholder. Regenerate with `npx supabase gen types typescript`. |
| **Authentication** | ❌ | Supabase Auth chosen. Need sign-up/login pages, middleware, invite-code flow. |
| **API Routes** | ❌ | No `src/app/api/` routes. Needed for draft actions, group CRUD, proposals. |
| **Real-time Sync** | ❌ | Supabase Realtime planned. Required for live multiplayer drafts. |
| **Persistence** | ❌ | Draft state stored as JSON column (schema ready), but no read/write logic yet. |

### Pages & Routing (❌ Not Started)

| Page | Purpose |
|------|---------|
| Home / Dashboard | Group overview, upcoming drafts, quick actions |
| Group Page | Members, draft proposals, voting, history |
| Draft Planning | Set selection, scheduling, RSVP |
| `/draft/new` | Wire `CreateDraftForm` component |
| `/draft/[id]` | Wire draft lifecycle components (lobby → pick → deck build → results) |
| Admin Panel | User/group/draft management |
| Settings | User profile, preferences |
| Auth pages | Sign-up (with invite code), login, forgot password |

### Quality & Operations (❌ Not Started)

| Item | Notes |
|------|-------|
| Tests | No unit, integration, or E2E tests |
| Error boundaries | No React error boundaries |
| Logging / monitoring | No error tracking or analytics |
| Environment variables | `.env.local` exists for local dev; production env not configured |
| CI/CD | No pipeline configured |

---

## Type System Reference

### Key Enums

| Enum | Values |
|------|--------|
| `DraftFormat` | `"standard"` · `"winston"` · `"cube"` |
| `PacingMode` | `"realtime"` · `"async"` |
| `DraftStatus` | `"proposed"` → `"confirmed"` → `"active"` → `"deck_building"` → `"complete"` |
| `TimerPreset` | `"relaxed"` (1.5x) · `"competitive"` (1x) · `"speed"` (0.5x) · `"none"` (∞) |
| `PackEra` | `"play_booster"` · `"draft_booster"` |
| `Rarity` | `"common"` · `"uncommon"` · `"rare"` · `"mythic"` |

### Core Data Models

| Type | Key Fields |
|------|------------|
| `CardReference` | `scryfallId`, `name`, `imageUrl`, `rarity`, `colors`, `cmc`, `isFoil` |
| `PackTemplate` | `slots[]` (position, rarity pool, weights, foil flag) |
| `DraftSeat` | `position`, `userId`, `currentPack`, `picks`, `pool`, `deck`, `sideboard`, `queuedCardId`, `basicLands` |
| `Draft` | Full session state — config, seats, packs, status, timer settings |
| `WinstonState` | `stack`, 3 `piles`, `activePile`, `activePlayerIndex` |

---

## Draft Engine API Reference

### Lifecycle Functions

| Function | Transition | Description |
|----------|-----------|-------------|
| `createDraft(config)` | → `proposed` | Factory function |
| `confirmDraft(draft)` | `proposed` → `confirmed` | Lock in draft config |
| `startDraft(draft, packs)` | `confirmed` → `active` | Distribute first packs |
| `transitionToDeckBuilding(draft)` | `active` → `deck_building` | Initialize deck/sideboard |
| `completeDraft(draft)` | `deck_building` → `complete` | Finalize |

### Pick Functions

| Function | Description |
|----------|-------------|
| `makePick(draft, seatPosition, cardId)` | Remove card from pack, add to picks/pool |
| `passCurrentPacks(draft)` | Pass packs left/right based on pack number |
| `allPlayersHavePicked(draft)` | Check if round is ready to advance |
| `advanceToNextPack(draft, nextPacks)` | Move to next pack |
| `autoPickCard(cards, queuedCardId?)` | Pick queued card if valid, else highest rarity fallback |
| `queuePick(draft, seatPosition, cardId)` | Queue a card for auto-pick on timer expiry |
| `clearQueuedPick(draft, seatPosition)` | Clear queued pick manually |

### Winston Functions

| Function | Description |
|----------|-------------|
| `initializeWinston(draft, allCards)` | Set up 3 piles + stack |
| `winstonLookAtPile(draft, pileIndex)` | Reveal pile contents |
| `winstonTakePile(draft)` | Take current pile, refill from stack |
| `winstonPassPile(draft)` | Add card to pile, advance |

### Deck Building Functions

| Function | Description |
|----------|-------------|
| `moveCardToDeck(draft, seat, cardId)` | Sideboard → deck |
| `moveCardToSideboard(draft, seat, cardId)` | Deck → sideboard |
| `setBasicLands(draft, seat, lands)` | Set WUBRG land counts |
| `suggestLandCounts(pool)` | Auto-suggest mana base from color distribution |
| `submitDeck(draft, seat)` | Submit, auto-complete if all done |
| `isDeckValid(seat)` | 40-card minimum check |

---

## File Inventory

**Total source code**: ~4,950 lines across 23 source files

```
src/
├── app/
│   ├── layout.tsx                          ✅  48 lines
│   ├── page.tsx                            ❌  placeholder
│   ├── globals.css                         ✅  95 lines
│   ├── draft/                              ❌  empty
│   │   ├── [id]/                           ❌  empty
│   │   └── new/                            ❌  empty
│   └── api/                                ❌  does not exist
├── components/
│   ├── draft/
│   │   ├── CreateDraftForm.tsx             ✅  510 lines
│   │   ├── DraftLobby.tsx                  ✅  234 lines
│   │   ├── PickScreen.tsx                  ✅  221 lines
│   │   ├── PickedCardsDrawer.tsx           ✅  167 lines
│   │   ├── BetweenPackScreen.tsx           ✅  196 lines
│   │   ├── WinstonDraftScreen.tsx          ✅  222 lines
│   │   └── PostDraftScreen.tsx             ✅  252 lines
│   ├── deck-builder/
│   │   └── DeckBuilderScreen.tsx           ✅  457 lines
│   └── ui/
│       ├── CardThumbnail.tsx               ✅   61 lines
│       ├── CardPreview.tsx                 ✅   73 lines
│       ├── Timer.tsx                       ✅   59 lines
│       └── ManaCurve.tsx                   ✅   48 lines
└── lib/
    ├── types.ts                            ✅  228 lines
    ├── draft-engine.ts                     ✅  960 lines
    ├── scryfall.ts                         ✅  373 lines
    ├── pack-generator.ts                   ✅  335 lines
    ├── export.ts                           ✅  140 lines
    ├── supabase.ts                         ✅   10 lines
    ├── supabase-server.ts                  ✅   24 lines
    └── database.types.ts                   ⚠️  220 lines (placeholder)

supabase/
├── config.toml                             ✅  Supabase local config
├── migrations/
│   └── 20260211_001_initial_schema.sql     ✅  8 tables, indexes, RLS
└── seed.sql                                ✅  Bootstrap admin + invite
```

---

**End of Codebase Status Report**
