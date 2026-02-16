# Podman Codebase Analysis

*Generated 2026-02-15*

---

## 1. Project Overview

**Podman** is a full-stack web application for conducting Magic: The Gathering (MTG) booster drafts online. Players create groups, propose drafts, open booster packs, pick cards in timed rounds, pass packs to the next player, build decks, and export decklists.

| Attribute | Value |
|---|---|
| **Type** | Real-time multiplayer web application |
| **Stack** | Next.js 16 (App Router) + React 19 + TailwindCSS 4 + Supabase + Vercel |
| **Language** | TypeScript (strict mode, zero `any` types) |
| **Architecture** | Server-centric with thin client shells — Next.js App Router pattern |
| **Source files** | 93 TypeScript files, ~15,600 lines of application code |
| **Database** | Supabase (PostgreSQL) with Row Level Security |
| **Auth** | Supabase Auth (email/password) |
| **Real-time** | Supabase Realtime (Postgres Changes) |
| **Caching** | L1 module Map → L2 Upstash Redis → L3 Postgres RPC |
| **Monitoring** | Sentry (client + server + edge) |
| **CI/CD** | GitHub Actions → Vercel (auto-deploy) |
| **Domain** | `www.podman.app` (prod), PR preview URLs (staging) |

### Supported Draft Formats

- **Standard Draft** (up to 8 players): open packs, pick one card, pass remaining
- **Winston Draft** (2 players): face-down pile-based drafting
- **Cube Draft**: bring-your-own card pool (paste list or CubeCobra import)
- **Simulated Drafts**: play against AI bots (any format)
- **Crack a Pack**: standalone pack opening for fun

---

## 2. Detailed Directory Structure

```
podman/
├── .github/workflows/       # CI + daily set sync (2 workflows)
├── public/                  # Static assets, PWA manifest
├── scripts/                 # Data management CLI tools (6 files, ~1,822 lines)
├── src/
│   ├── app/                 # Next.js App Router routes (52 files, ~5,571 lines)
│   │   ├── (app)/           # Auth-protected layout group
│   │   │   ├── crack-a-pack/    # Standalone pack opening
│   │   │   ├── dashboard/       # Groups, profiles, admin, simulate
│   │   │   └── draft/[draftId]/ # Draft flow: lobby → pick → deckbuild → results
│   │   ├── api/             # REST endpoints (sets, boosters, avatar)
│   │   ├── auth/            # Login, signup, signout
│   │   ├── draft/           # Legacy redirects
│   │   └── invite/[token]/  # Public invite landing page
│   ├── components/          # React components (17 files, ~4,200 lines)
│   │   ├── deck-builder/    # DeckBuilderScreen (709 lines)
│   │   ├── draft/           # PickScreen, lobby, results, etc. (11 files)
│   │   └── ui/              # Shared primitives: Avatar, Thumbnail, Timer, etc. (5 files)
│   ├── hooks/               # Custom React hooks (2 files, 326 lines)
│   ├── lib/                 # Core logic, types, clients (18 files, ~4,290 lines)
│   │   ├── __tests__/       # Vitest unit tests (1,222 lines, 88 tests)
│   │   ├── draft-engine.ts  # Pure functional draft state machine (1,092 lines)
│   │   ├── scryfall.ts      # Rate-limited API client (684 lines)
│   │   └── types.ts         # All shared TypeScript types (266 lines)
│   ├── instrumentation.ts       # Sentry server/edge init
│   ├── instrumentation-client.ts # Sentry browser init
│   └── middleware.ts             # Auth session refresh
├── supabase/
│   └── migrations/          # 12 SQL migration files (811 lines)
├── docs/                    # Architecture docs and plans
├── backups/                 # Production data backups (gitignored)
├── next.config.ts           # Build config + security headers + Sentry
├── eslint.config.mjs        # ESLint flat config
├── postcss.config.mjs       # TailwindCSS v4 PostCSS plugin
├── package.json             # Dependencies and scripts
└── tsconfig.json            # TypeScript strict config
```

### Directory Roles

| Directory | Purpose | Connects To |
|---|---|---|
| `src/lib/` | Core business logic: draft engine, pack generation, Scryfall client, Supabase clients, types | Everything — the foundation layer |
| `src/app/` | Routes, pages, layouts, server actions, API handlers | `src/lib/` for logic, `src/components/` for UI |
| `src/components/` | Reusable React components (client-side) | `src/lib/` for types, `src/hooks/` for behavior |
| `src/hooks/` | Custom hooks: carousel physics, Realtime subscriptions | `src/lib/` for Supabase client and types |
| `scripts/` | CLI tools for data management (backup, restore, sync, ETL) | Supabase Management API, Upstash Redis |
| `supabase/migrations/` | Database schema evolution | Applied via `supabase db push` |
| `.github/workflows/` | CI pipeline + daily automation | GitHub Actions → npm scripts |

---

## 3. File-by-File Breakdown

### Core Application Files — `src/lib/` (18 files, ~4,290 lines)

| File | Lines | Purpose |
|---|---|---|
| `types.ts` | 266 | All shared types: `Draft`, `DraftSeat`, `CardReference`, `PackState`, filter types, timer constants |
| `draft-engine.ts` | 1,092 | Pure functional draft state machine: create, start, pick, pass, Winston, deck building |
| `scryfall.ts` | 684 | Rate-limited Scryfall API client (75ms interval, 10 req/s), card fetching, set info |
| `pack-generator.ts` | 346 | Template-based pack generation with weighted random slot filling |
| `bot-drafter.ts` | 201 | AI bot pick heuristics (rarity-first → color-commit algorithm) |
| `sheet-pack-generator.ts` | 189 | Sheet-based pack generation from booster distribution data |
| `booster-data.ts` | 183 | Three-layer cache: L1 Map → L2 Redis → L3 Postgres RPC |
| `bot-runner.ts` | 168 | Orchestrates sequential bot turns after human picks |
| `export.ts` | 143 | Deck export: plaintext, Cockatrice XML, clipboard, file download |
| `generate-packs.ts` | 131 | High-level pack orchestrator: sheet-based → template fallback |
| `database.types.ts` | 686 | Auto-generated Supabase schema types |
| `kv.ts` | 49 | Upstash Redis wrapper (graceful no-op when env vars missing) |
| `supabase-middleware.ts` | 52 | Auth session refresh + route protection middleware logic |
| `supabase-server.ts` | 39 | Server-side Supabase client with `React.cache()` memoized `getUser()` |
| `admin-guard.ts` | 24 | Site admin route authorization guard |
| `supabase-admin.ts` | 23 | Admin Supabase client (bypasses RLS, for draft mutations) |
| `supabase.ts` | 9 | Browser-side Supabase client factory |
| `__tests__/draft-engine.test.ts` | 1,222 | 88 Vitest unit tests covering full draft lifecycle |

### Route Files — `src/app/` (52 files, ~5,571 lines)

#### API Route Handlers

| Route | Method | Lines | Purpose |
|---|---|---|---|
| `/api/sets` | GET | 24 | Draftable MTG sets from Scryfall (cached 24h) |
| `/api/boosters` | GET | 56 | Booster products for a set code |
| `/api/avatar` | POST | 40 | Avatar image upload to Vercel Blob |
| `/auth/signout` | POST | 8 | Sign out + redirect |

#### Server Actions Files (9 files, ~1,562 lines total)

| File | Lines | Key Actions |
|---|---|---|
| `draft/[draftId]/actions.ts` | 699 | `makePickAction`, `startDraftAction`, `submitDeckAction`, `applyDraftMutation` (optimistic concurrency) |
| `groups/[groupId]/actions.ts` | 323 | `voteOnProposal` (TOCTOU-safe), `convertProposalToDraft`, `createInviteLinkAction` |
| `dashboard/simulate/actions.ts` | 216 | `createSimulatedDraftAction` (full pack gen + bot setup) |
| `dashboard/admin/actions.ts` | 101 | `resetUserPassword`, `deleteUser`, `deleteGroup`, `deleteDraft` |
| `groups/actions.ts` | 64 | `createGroup`, `leaveGroup` |
| `auth/actions.ts` | 51 | `login`, `signup` (with open redirect validation) |
| `crack-a-pack/actions.ts` | 47 | `crackAPackAction`, `warmBoosterDataAction` |
| `profile/actions.ts` | 35 | `updateProfile` |
| `invite/[token]/actions.ts` | 26 | `acceptInviteAction` |

#### Pages (Server Components)

| Page | Lines | Purpose |
|---|---|---|
| `(app)/dashboard/page.tsx` | 250 | Main dashboard: groups, active drafts, simulations, profile |
| `groups/[groupId]/page.tsx` | 294 | Group detail: members, proposals, active drafts, invites |
| `proposals/[proposalId]/page.tsx` | 212 | Proposal detail: votes, config, actions |
| `draft/[draftId]/lobby/page.tsx` | 112 | Draft lobby: seats, config, start/leave |
| `draft/[draftId]/pick/page.tsx` | 105 | Pick screen: current pack for user's seat only |
| `invite/[token]/page.tsx` | 101 | Public invite landing (4 states) |
| `draft/[draftId]/results/page.tsx` | 77 | Post-draft results and pick history |

#### Client Components (Interactive Shells)

| Component | Lines | Purpose |
|---|---|---|
| `admin/AdminClient.tsx` | 402 | Tabbed admin UI (users/groups/drafts CRUD) |
| `draft/[draftId]/pick/PickClient.tsx` | 269 | Pick screen orchestrator with Realtime + timer |
| `profile/ProfileForm.tsx` | 218 | Profile edit: avatar, bio, colors |
| `crack-a-pack/CrackAPackClient.tsx` | 184 | Crack a Pack interactive flow |
| `groups/[groupId]/InviteLinksSection.tsx` | 117 | Invite link management |
| `draft/[draftId]/winston/WinstonClient.tsx` | 115 | Winston draft Realtime wrapper |
| `proposals/[proposalId]/ProposalActions.tsx` | 109 | Vote/convert/cancel with optimistic UI |
| `draft/[draftId]/lobby/LobbyClient.tsx` | 106 | Lobby Realtime wrapper |
| `draft/[draftId]/deckbuild/DeckBuildClient.tsx` | 101 | Deck builder wrapper with auto-save |

### UI Components — `src/components/` (17 files, ~4,200 lines)

| Component | Lines | Purpose |
|---|---|---|
| `PickScreen.tsx` | 865 | Mobile carousel + desktop grid pick interface |
| `DeckBuilderScreen.tsx` | 709 | Full deck builder: grid, lands, stats, export |
| `CreateDraftForm.tsx` | 592 | Multi-section draft configuration form |
| `PostDraftScreen.tsx` | 411 | Results: deck/pool grids, pick history, export |
| `DraftLobby.tsx` | 239 | Pre-draft lobby with seats and config |
| `WinstonDraftScreen.tsx` | 222 | Winston draft 3-pile UI |
| `BetweenPackScreen.tsx` | 186 | Review period between packs |
| `SetPicker.tsx` | 178 | Autocomplete MTG set selector |
| `PickedCardsDrawer.tsx` | 167 | Sortable picks drawer with preview |
| `PodMemberList.tsx` | 123 | Pod players with avatars and direction arrows |
| `UserAvatar.tsx` | 97 | Image/emoji/letter avatar with MTG color ring |
| `CardThumbnail.tsx` | 79 | Clickable card image with color border |
| `WaitingScreen.tsx` | 79 | "Waiting for pack" screen with deck builder |
| `CardPreview.tsx` | 74 | Full-size card preview modal content |
| `Timer.tsx` | 69 | Color-coded countdown timer |
| `PodStatusOverlay.tsx` | 67 | Pod status bottom-sheet overlay |
| `ManaCurve.tsx` | 49 | Bar chart mana curve visualization |

### Custom Hooks — `src/hooks/` (2 files, 326 lines)

| Hook | Lines | Purpose |
|---|---|---|
| `useCarousel.ts` | 288 | Pure-JS transform carousel: touch physics, snap, momentum, scrub bar |
| `useRealtimeChannel.ts` | 38 | Supabase Realtime channel lifecycle wrapper |

### Scripts — `scripts/` (6 files, ~1,822 lines)

| Script | Lines | Purpose |
|---|---|---|
| `test-packs.ts` | 651 | Validate pack generation across all sets (DB integrity + Scryfall resolution) |
| `load-booster-data.ts` | 388 | ETL: download booster data from GitHub, load into Supabase, invalidate Redis |
| `sync-staging.ts` | 356 | Full prod-to-staging data sync with migration alignment |
| `restore-prod.ts` | 216 | Restore production from JSON backup |
| `supabase-api.ts` | 124 | Shared Supabase Management API client for scripts |
| `backup-prod.ts` | 87 | Export all production data to timestamped JSON files |

### Database Migrations — `supabase/migrations/` (12 files, 811 lines)

| Migration | Lines | Purpose |
|---|---|---|
| `20260211000000_initial_schema.sql` | 317 | Full initial schema: tables, triggers, RLS, functions |
| `20260213000300_fix_rls_infinite_recursion.sql` | 137 | SECURITY DEFINER helpers to break RLS self-reference cycles |
| `20260214000100_group_invite_links.sql` | 119 | Time-limited invite tokens replacing static codes |
| `20260214000200_booster_distribution_tables.sql` | 88 | Five-table booster data schema (~300K rows) |
| `20260215000200_get_booster_product_json.sql` | 61 | Postgres function: collapse booster tables into single JSONB |
| `20260213000200_join_group_rpc.sql` | 37 | Group invite RPC (superseded by `20260214000100`) |
| `20260214000000_simulated_drafts.sql` | 16 | `is_simulated` flag + nullable `group_id` |
| `20260212000000_anon_invite_select_policy.sql` | 15 | Anon RLS for invite validation |
| `20260215000000_add_profile_bio_and_favorite_color.sql` | 6 | Bio and favorite color columns |
| `20260215000100_add_group_emoji.sql` | 5 | Group emoji column |
| `20260213000100_enable_realtime.sql` | 4 | Enable Realtime for 4 tables |
| `20260213000000_add_drafts_version.sql` | 1 | Optimistic concurrency version column |

### Configuration Files

| File | Lines | Purpose |
|---|---|---|
| `next.config.ts` | 38 | Remote images, security headers, Sentry source maps |
| `eslint.config.mjs` | 26 | ESLint flat config (Next.js + TypeScript rules) |
| `src/middleware.ts` | 12 | Edge middleware: auth session refresh + route protection |
| `src/instrumentation.ts` | 13 | Sentry server/edge init via `register()` hook |
| `src/instrumentation-client.ts` | 9 | Sentry browser init with Session Replay |
| `sentry.server.config.ts` | 6 | Sentry Node.js config |
| `sentry.edge.config.ts` | 6 | Sentry Edge config |
| `postcss.config.mjs` | 7 | TailwindCSS v4 PostCSS plugin |
| `.github/workflows/ci.yml` | 31 | PR CI: lint + build + test |
| `.github/workflows/update-sets.yml` | 35 | Daily MTG set sync automation |

---

## 4. API Endpoints Analysis

### REST Endpoints

| Endpoint | Method | Auth | Cache | Purpose |
|---|---|---|---|---|
| `/api/sets` | GET | None | 24h (`revalidate`) | Returns draftable MTG sets from Scryfall |
| `/api/boosters?set={code}` | GET | None | 24h (`s-maxage`) | Returns available booster products for a set |
| `/api/avatar` | POST | Required | None | Upload avatar image to Vercel Blob (max 2MB) |
| `/auth/signout` | POST | Required | None | Sign out and redirect to login |

### Server Actions (RPC-style)

All server actions follow the pattern: `"use server"` → auth check → business logic → return `{ error }` or `void`/redirect.

**Draft lifecycle actions** (in `draft/[draftId]/actions.ts`):
- `joinDraft(draftId)` — add player to draft
- `leaveDraft(draftId)` — remove player from draft
- `startDraftAction(draftId)` — generate packs, start engine, init state
- `makePickAction(draftId, cardId)` — pick a card (with bot follow-up)
- `autoPickAction(draftId)` — auto-pick when timer expires
- `submitDeckAction(...)` — submit final deck
- `saveDeckAction(...)` — auto-save deck progress
- `editDeckAction(draftId)` — unsubmit deck for editing

**Core mutation pattern** — `applyDraftMutation(draftId, mutationFn)`:
1. Read current `drafts.state` + `version`
2. Apply pure function mutation
3. Write back with `.eq("version", expectedVersion)`
4. Retry up to 3 times on version conflict

### Authentication Pattern

- Edge Middleware refreshes Supabase session on every request
- Public routes: `/auth/*`, `/invite/*` (middleware allowlist)
- All other routes require authentication
- Server actions re-verify auth at the top of each call
- Admin actions additionally check `is_site_admin` in profiles table
- Draft mutations use admin client to bypass RLS

---

## 5. Architecture Deep Dive

### Overall Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VERCEL (Edge + Node.js)                     │
│                                                                     │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │  Middleware   │───>│  App Router      │───>│  Server Actions  │  │
│  │  (auth gate) │    │  (SSR pages)     │    │  (mutations)     │  │
│  └──────────────┘    └──────────────────┘    └──────────────────┘  │
│         │                     │                       │             │
│         │              ┌──────┴──────┐         ┌──────┴──────┐     │
│         │              │ React RSC   │         │ Admin Client│     │
│         │              │ (data fetch)│         │ (bypass RLS)│     │
│         │              └──────┬──────┘         └──────┬──────┘     │
│         │                     │                       │             │
│         └─────────────────────┼───────────────────────┘             │
│                               │                                     │
│  ┌──────────────┐    ┌───────┴────────┐    ┌──────────────────┐    │
│  │   Sentry     │    │   Supabase     │    │   Upstash Redis  │    │
│  │  (monitoring)│    │  (Postgres +   │    │   (L2 cache)     │    │
│  └──────────────┘    │   Auth +       │    └──────────────────┘    │
│                      │   Realtime)    │                             │
│  ┌──────────────┐    └───────┬────────┘    ┌──────────────────┐    │
│  │ Vercel Blob  │            │             │   Scryfall API   │    │
│  │ (avatars)    │            │             │   (card data)    │    │
│  └──────────────┘            │             └──────────────────┘    │
│                              │                                      │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │     Browser         │
                    │  ┌───────────────┐  │
                    │  │ React Client  │  │
                    │  │ Components    │  │
                    │  ├───────────────┤  │
                    │  │ Supabase      │  │
                    │  │ Realtime      │  │
                    │  │ (WebSocket)   │  │
                    │  └───────────────┘  │
                    └─────────────────────┘
```

### Data Flow: Making a Pick

```
1. User taps card → PickClient calls makePickAction(draftId, cardId)
2. Server action:
   a. Auth check (getUser)
   b. Read drafts.state + version
   c. Call draft-engine.makePickAndPass() (pure function)
   d. If simulated: run bot picks sequentially
   e. Write updated state with version check (.eq("version", n))
   f. Retry on conflict (up to 3x)
3. Supabase Realtime broadcasts row change
4. All connected clients receive notification via WebSocket
5. PickClient's useRealtimeChannel handler calls router.refresh()
6. Next.js re-renders server component with fresh data
7. New pack appears in PickScreen (keyed by packReceivedAt)
```

### Key Design Patterns

1. **Pure Functional Core / Imperative Shell**: The draft engine (`draft-engine.ts`) is 1,092 lines of pure functions — no I/O, no side effects. All database interaction happens in server actions (`applyDraftMutation`). This enables comprehensive unit testing (88 tests) without mocking.

2. **Optimistic Concurrency Control**: Draft state uses a `version` column. Mutations read the current version, apply changes, and write back with `.eq("version", expectedVersion)`. On conflict, the operation retries up to 3 times with a fresh read.

3. **Server Components + Thin Client Shells**: Pages are server components that fetch data and pass it to client component "shells" (e.g., `PickClient`, `LobbyClient`, `WinstonClient`). Shells handle interactivity, Realtime subscriptions, and server action calls.

4. **Three-Layer Cache**: Booster distribution data uses L1 (module Map, per-instance) → L2 (Upstash Redis, global persistent) → L3 (Postgres RPC with JSONB aggregation). Cache warming triggers on user actions.

5. **Defense-in-Depth Authorization**: RLS policies on the database layer + explicit authorization checks in server actions + SECURITY DEFINER helper functions to avoid RLS recursion. Open redirect prevention on auth redirects.

6. **Realtime via Refresh**: Instead of client-side state management, Realtime events trigger `router.refresh()`, which re-renders the server component tree with fresh data. This keeps the source of truth on the server.

### Module Dependency Graph

```
types.ts ────────────────────────────────────────────── (no deps)
    │
    ├── draft-engine.ts ─────────────────────────────── (types only)
    │       │
    │       ├── bot-drafter.ts ──────────────────────── (types only)
    │       │       │
    │       │       └── bot-runner.ts ───────────────── (draft-engine + bot-drafter)
    │       │
    │       └── __tests__/draft-engine.test.ts ──────── (draft-engine + types)
    │
    ├── scryfall.ts ─────────────────────────────────── (types only)
    │
    ├── pack-generator.ts ───────────────────────────── (types only)
    │       │
    │       └── sheet-pack-generator.ts ─────────────── (types + booster-data + pack-gen)
    │
    ├── booster-data.ts ─────────────────────────────── (supabase-admin + kv)
    │
    ├── generate-packs.ts ───────────────────────────── (booster-data + scryfall + sheet-pack + pack-gen)
    │
    ├── export.ts ───────────────────────────────────── (types only)
    │
    ├── kv.ts ───────────────────────────────────────── (@upstash/redis)
    │
    ├── supabase.ts ─────────────────────────────────── (@supabase/ssr, database.types)
    ├── supabase-server.ts ──────────────────────────── (@supabase/ssr, react.cache)
    ├── supabase-admin.ts ───────────────────────────── (@supabase/supabase-js)
    └── supabase-middleware.ts ──────────────────────── (@supabase/ssr, next/server)
```

---

## 6. Environment & Setup Analysis

### Required Environment Variables

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Client + Server | Supabase publishable key (`sb_publishable_*`) |
| `SUPABASE_SECRET_KEY` | Server only | Supabase secret key (`sb_secret_*`), bypasses RLS |
| `BLOB_READ_WRITE_TOKEN` | Server only | Vercel Blob store token (avatar uploads) |
| `NEXT_PUBLIC_SENTRY_DSN` | Client + Server | Sentry error monitoring DSN |
| `SENTRY_ORG` | Build only | Sentry org slug (source map upload) |
| `SENTRY_PROJECT` | Build only | Sentry project slug |
| `SENTRY_AUTH_TOKEN` | Build only | Sentry auth token |
| `UPSTASH_REDIS_REST_URL` | Server only | Upstash Redis URL (booster cache) |
| `UPSTASH_REDIS_REST_TOKEN` | Server only | Upstash Redis token |
| `SUPABASE_PROJECT_REF` | Scripts only | Production Supabase project ref |
| `SUPABASE_STAGING_REF` | Scripts only | Staging Supabase project ref |
| `SUPABASE_ACCESS_TOKEN` | Scripts only | Supabase personal access token |

### Development Setup

```bash
# Install dependencies
npm ci

# Set up environment
cp .env.example .env.local  # Fill in values

# Start dev server
npm run dev                  # localhost:3000

# Run tests
npm test                     # Vitest unit tests (88 tests)

# Local Supabase (optional)
npx supabase start           # API :54321, DB :54322
```

### Deployment Workflow

1. Create feature branch: `git checkout -b feature-name`
2. Develop and commit
3. Push and open PR: `git push -u origin feature-name` → `gh pr create`
4. CI runs automatically (lint + build + test)
5. Test on PR preview URL (Vercel auto-deploy with staging env)
6. Backup production: `npm run backup-prod`
7. Merge PR: `gh pr merge`
8. Verify on `www.podman.app`
9. Clean up: `git checkout main && git pull && git branch -d feature-name`

**Never push directly to `main`.** All changes go through PRs.

---

## 7. Technology Stack Breakdown

### Runtime & Frameworks

| Technology | Version | Role |
|---|---|---|
| **Node.js** | 22 | Runtime (CI) |
| **Next.js** | 16.1.6 | Full-stack React framework (App Router) |
| **React** | 19.2.4 | UI library |
| **TypeScript** | 5.x | Type-safe JavaScript (strict mode) |
| **TailwindCSS** | 4.x | Utility-first CSS framework |

### Backend Services

| Service | Role |
|---|---|
| **Supabase** | Managed PostgreSQL + Auth + Realtime + RLS |
| **Vercel** | Hosting, serverless functions, edge middleware, blob storage |
| **Upstash Redis** | Persistent KV cache for booster data |
| **Sentry** | Error monitoring (client + server + edge) |

### External APIs

| API | Role |
|---|---|
| **Scryfall** | MTG card data, images, set information (rate-limited: 10 req/s) |
| **taw/magic-sealed-data** (GitHub) | Booster pack distribution data (ETL source) |
| **CubeCobra** | Cube card list import |

### Key NPM Dependencies

| Package | Role |
|---|---|
| `@supabase/ssr` | Server-side Supabase client with cookie auth |
| `@supabase/supabase-js` | Supabase JavaScript client |
| `@sentry/nextjs` | Sentry SDK for Next.js |
| `@upstash/redis` | Upstash Redis client |
| `@vercel/blob` | Vercel Blob storage client (avatar uploads) |
| `mana-font` | MTG mana symbol icon font |
| `keyrune` | MTG set symbol icon font |

### Dev Dependencies

| Package | Role |
|---|---|
| `vitest` | Unit testing framework |
| `eslint` + `eslint-config-next` | Linting |
| `@tailwindcss/postcss` | TailwindCSS v4 build integration |
| `chalk` + `ora` + `cli-table3` | CLI output formatting for scripts |
| `tsx` | TypeScript script execution |

### Build & Deployment

| Tool | Role |
|---|---|
| **Vercel** | Auto-deploy: PR previews (staging env) + production on merge |
| **GitHub Actions** | CI (lint + build + test on PRs), daily set sync |
| **Turbopack** | Next.js dev server bundler |

---

## 8. Visual Architecture Diagram

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ PickScreen  │  │ DeckBuilder  │  │ Dashboard / Groups /  │  │
│  │ (carousel + │  │ (grid +      │  │ Profiles / Admin      │  │
│  │  desktop)   │  │  auto-save)  │  │                       │  │
│  └──────┬──────┘  └──────┬───────┘  └───────────┬───────────┘  │
│         │                │                       │              │
│  ┌──────┴────────────────┴───────────────────────┴───────────┐  │
│  │              Supabase Realtime (WebSocket)                 │  │
│  │    → postgres_changes → router.refresh() → re-render      │  │
│  └────────────────────────────┬───────────────────────────────┘  │
│                               │                                  │
└───────────────────────────────┼──────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │   VERCEL PLATFORM     │
                    │                       │
                    │  ┌─────────────────┐  │
                    │  │ Edge Middleware  │  │  ← Auth session refresh
                    │  └────────┬────────┘  │
                    │           │           │
                    │  ┌────────┴────────┐  │
                    │  │  Server         │  │
                    │  │  Components     │  │  ← Data fetching (RSC)
                    │  │  + Server       │  │  ← Draft mutations
                    │  │  Actions        │  │  ← Optimistic concurrency
                    │  └────────┬────────┘  │
                    │           │           │
                    │  ┌────────┴────────┐  │
                    │  │  API Routes     │  │  ← /api/sets, boosters, avatar
                    │  └────────┬────────┘  │
                    │           │           │
                    │  ┌────────┴────────┐  │
                    │  │  Vercel Blob    │  │  ← Avatar image storage
                    │  └────────────────┘  │
                    └───────────┬───────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
┌─────────┴─────────┐ ┌────────┴────────┐ ┌──────────┴──────────┐
│   SUPABASE        │ │  UPSTASH REDIS  │ │   SCRYFALL API      │
│                   │ │                 │ │                     │
│  ┌─────────────┐  │ │  Booster data   │ │  Card images        │
│  │ PostgreSQL  │  │ │  L2 cache       │ │  Set information    │
│  │ (+ RLS)     │  │ │  (booster:*)    │ │  Card metadata      │
│  ├─────────────┤  │ │                 │ │  (rate: 10 req/s)   │
│  │ Auth        │  │ └─────────────────┘ └─────────────────────┘
│  ├─────────────┤  │
│  │ Realtime    │  │         ┌─────────────────────┐
│  └─────────────┘  │         │   SENTRY            │
└───────────────────┘         │  Error monitoring   │
                              │  Session replay     │
                              └─────────────────────┘
```

### Data Model (ER Diagram)

```
┌──────────────┐       ┌──────────────┐       ┌──────────────────┐
│  auth.users  │──1:1──│   profiles   │       │     groups       │
│              │       │  display_name│       │  name, emoji     │
│  email       │       │  avatar_url  │       │  description     │
│  password    │       │  bio         │       │  created_by      │
│              │       │  fav_color   │       └────────┬─────────┘
└──────────────┘       │  is_admin    │                │
                       └──────┬───────┘         ┌──────┴──────┐
                              │                 │             │
                       ┌──────┴──────┐   ┌──────┴──────┐ ┌────┴──────────┐
                       │group_members│   │group_invites│ │draft_proposals│
                       │  role       │   │  token      │ │  title, config│
                       │  (admin/    │   │  expires_at │ │  status       │
                       │   member)   │   │  use_count  │ └───────┬───────┘
                       └─────────────┘   └─────────────┘         │
                                                          ┌──────┴──────┐
                                                          │proposal_votes│
                                                          │  vote (in/  │
                                                          │   out)      │
                                                          └─────────────┘

┌──────────────┐       ┌──────────────┐
│    drafts    │──1:N──│draft_players │
│  state (JSON)│       │  user_id     │
│  status      │       │  seat        │
│  format      │       └──────────────┘
│  version     │
│  is_simulated│
│  group_id?   │
└──────────────┘

┌──────────────────┐   ┌──────────────┐   ┌──────────────────┐
│booster_products  │──>│booster_configs│──>│booster_config_   │
│  code, set_code  │   │  name        │   │  slots           │
│  name            │   └──────────────┘   │  sheet_id, count │
└──────────────────┘                      └──────────────────┘
        │
        └──────────────>┌──────────────┐   ┌──────────────────┐
                        │booster_sheets│──>│   sheet_cards     │
                        │  name        │   │  set, number     │
                        └──────────────┘   │  weight          │
                                           └──────────────────┘
```

### Draft Flow State Machine

```
                    ┌──────────┐
                    │ proposed │ ← createProposal / createSimulatedDraft
                    └────┬─────┘
                         │ convertProposalToDraft / direct start
                    ┌────┴─────┐
                    │  lobby   │ ← joinDraft / leaveDraft
                    └────┬─────┘
                         │ startDraftAction (generate packs)
                    ┌────┴─────┐
              ┌─────│  active  │─────┐
              │     └────┬─────┘     │
              │          │           │
         Standard/    Winston     All picks
          Cube         Draft      complete
              │          │           │
              │     ┌────┴─────┐     │
              │     │ winston  │     │
              │     │  loops   │     │
              │     └────┬─────┘     │
              │          │           │
              └──────────┼───────────┘
                         │ transitionToDeckBuilding
                  ┌──────┴───────┐
                  │deck_building │ ← submitDeck / skipDeckBuilding / editDeck
                  └──────┬───────┘
                         │ all decks submitted
                  ┌──────┴───────┐
                  │   complete   │ ← results view, export
                  └──────────────┘
```

---

## 9. Key Insights & Recommendations

### Code Quality Assessment

**Strengths:**
- **TypeScript strict mode** with zero `any` types and zero `@ts-ignore` — excellent type safety
- **Pure functional draft engine** with 88 unit tests — the core business logic is thoroughly tested and isolated from I/O
- **Clean separation of concerns**: server actions handle mutations, server components handle data fetching, client components handle interactivity
- **Security-first design**: defense-in-depth auth, TOCTOU-safe voting, open redirect prevention, security headers, RLS everywhere
- **Zero lint warnings** and zero npm audit vulnerabilities (as of Feb 2026 audit)
- **Optimistic concurrency** prevents draft state corruption in concurrent pick scenarios
- **Three-layer caching** keeps booster data fast without sacrificing consistency

**Areas of Note:**
- `PickScreen.tsx` (865 lines) and `DeckBuilderScreen.tsx` (709 lines) are the largest components — they manage complex UIs with many state variables but are well-structured with clear responsibilities
- `draft/[draftId]/actions.ts` (699 lines) consolidates all draft mutations — this is intentional as they share `applyDraftMutation` infrastructure
- The `database.types.ts` file (686 lines) is auto-generated and maintained separately

### Architecture Strengths

1. **Server-centric data flow**: All data flows through server components, avoiding client-side caching inconsistencies. Realtime events simply trigger `router.refresh()`.
2. **Immutable state machine**: The draft engine operates on immutable state objects with pure function transformers. This makes concurrent access safe and testing trivial.
3. **Progressive enhancement**: The carousel uses pure JavaScript transforms (not browser scroll) to avoid 120Hz timing issues, with CSS container queries for responsive sizing.
4. **ETL automation**: Daily GitHub Actions workflow keeps booster data current across both environments without manual intervention.

### Potential Improvements

1. **Component splitting**: `PickScreen.tsx` could potentially extract the desktop grid view and mobile carousel view into separate sub-components if further features are added
2. **E2E testing**: The project has strong unit tests for the draft engine but no end-to-end tests for the full user flow — adding Playwright tests could catch integration issues
3. **Rate limiting**: Server actions don't currently rate-limit requests — adding API-level throttling could prevent abuse
4. **Offline support**: The PWA manifest exists but there's no service worker for offline capability — draft state could be cached locally for resilience

### Security Considerations

- All security patterns are well-implemented: RLS, SECURITY DEFINER helpers, open redirect prevention, TOCTOU-safe mutations, security headers, admin guards
- Sentry monitoring captures errors across all runtimes (client, server, edge)
- The admin client (`supabase-admin.ts`) is correctly restricted to server-only usage
- File uploads validate type and size before processing
- Auth session refresh happens at the middleware layer on every request

### Performance Profile

- **Static caching**: Set and booster API responses cached 24 hours
- **Booster data**: Three-layer cache eliminates repeated Postgres queries
- **Image optimization**: Scryfall card images served through Next.js Image with remote pattern optimization
- **Parallel data fetching**: Server components use `Promise.all` extensively for parallel queries
- **React.cache()**: `getUser()` is memoized within each render tree to avoid duplicate auth calls
- **Debounced auto-save**: Deck builder saves with 1-second debounce to prevent excessive writes

---

## Appendix: Line Count Summary

| Category | Files | Lines |
|---|---|---|
| Library (`src/lib/`) | 18 | ~4,290 |
| Routes (`src/app/`) | 52 | ~5,571 |
| Components (`src/components/`) | 17 | ~4,200 |
| Hooks (`src/hooks/`) | 2 | 326 |
| Scripts (`scripts/`) | 6 | ~1,822 |
| Migrations (`supabase/migrations/`) | 12 | 811 |
| Config files | 10 | ~171 |
| CSS (`globals.css`) | 1 | 113 |
| **Total application code** | **~118** | **~17,300** |
