# Podman Codebase Analysis

> Comprehensive analysis generated February 15, 2026

---

## 1. Project Overview

**Project type**: Full-stack web application
**Domain**: Magic: The Gathering (MTG) draft simulator — players open booster packs, pick cards in timed rounds, pass packs to the next player, and build decks.

**Tech stack**:
- **Runtime**: Node.js (Next.js 16 with App Router)
- **Language**: TypeScript 5 (strict mode, zero `any` types)
- **Frontend**: React 19, TailwindCSS 4
- **Backend**: Next.js Server Actions + API Routes
- **Database**: PostgreSQL via Supabase (Auth, Realtime, RLS)
- **Hosting**: Vercel (production + preview deployments)
- **Monitoring**: Sentry (client + server + edge error tracking)
- **Testing**: Vitest (88 unit tests for draft engine)

**Architecture pattern**: Server-first React with App Router — server components for data fetching, client components for interactivity, server actions for mutations. No separate API server; Supabase handles persistence and auth.

---

## 2. Directory Structure

```
podman/
├── src/                        # Application source (91 .ts/.tsx files)
│   ├── app/                    # Next.js App Router pages & routes
│   │   ├── auth/               # Public auth pages (login, signup, signout)
│   │   ├── (app)/              # Auth-protected routes (layout with header)
│   │   │   ├── dashboard/      # Groups, profile, simulate, admin
│   │   │   ├── draft/[draftId]/ # Draft flow (lobby → pick → deckbuild → results)
│   │   │   └── crack-a-pack/   # Standalone pack opening
│   │   ├── api/                # REST endpoints (sets, boosters, avatar)
│   │   ├── invite/[token]/     # Public invite landing page
│   │   └── global-error.tsx    # Sentry error boundary
│   ├── lib/                    # Core business logic (16 files)
│   │   ├── draft-engine.ts     # Pure draft state machine (1,092 lines)
│   │   ├── types.ts            # All TypeScript types/interfaces (266 lines)
│   │   ├── scryfall.ts         # Scryfall API client with rate limiting (663 lines)
│   │   ├── generate-packs.ts   # Pack generation orchestration
│   │   ├── pack-generator.ts   # Template-based pack generation
│   │   ├── sheet-pack-generator.ts # Data-driven pack generation
│   │   ├── booster-data.ts     # Booster distribution data loader
│   │   ├── bot-drafter.ts      # Bot AI (rarity-first, color-commit)
│   │   ├── bot-runner.ts       # Bot pick execution
│   │   ├── export.ts           # Deck export (clipboard, .cod, .txt)
│   │   ├── supabase.ts         # Browser Supabase client
│   │   ├── supabase-server.ts  # Server Supabase client (cookie-based)
│   │   ├── supabase-admin.ts   # Admin Supabase client (bypasses RLS)
│   │   ├── supabase-middleware.ts # Session refresh middleware
│   │   ├── admin-guard.ts      # Admin route protection
│   │   └── database.types.ts   # Generated Supabase types
│   ├── components/             # React components
│   │   ├── draft/              # Draft-specific (12 components)
│   │   ├── deck-builder/       # Deck builder screen
│   │   └── ui/                 # Shared UI (5 components)
│   └── hooks/                  # Custom hooks (1 file)
│       └── useRealtimeChannel.ts
├── supabase/                   # Database configuration
│   ├── migrations/             # 9 SQL migration files
│   ├── config.toml             # Local Supabase config
│   └── seed.sql                # Seed data
├── scripts/                    # CLI utilities
│   ├── load-booster-data.ts    # Load booster distribution into DB
│   └── test-packs.ts           # Validate pack generation across sets
├── docs/                       # Design documents and plans
├── public/                     # Static assets
└── .bootstrap_docs/            # Initial project templates (gitignored)
```

---

## 3. File-by-File Breakdown

### Core Application Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/draft-engine.ts` | 1,092 | Pure functional draft state machine — create, pick, pass, deck-build, Winston |
| `src/lib/types.ts` | 266 | All shared TypeScript types: Draft, DraftSeat, CardReference, PackState, etc. |
| `src/lib/scryfall.ts` | 663 | Rate-limited Scryfall API client, card data fetching, DFC handling |
| `src/lib/generate-packs.ts` | ~150 | Pack generation orchestration (data-driven → template fallback) |
| `src/lib/pack-generator.ts` | ~200 | Template-based pack generation (rarity slots) |
| `src/lib/sheet-pack-generator.ts` | ~180 | Data-driven pack generation (booster distribution sheets) |
| `src/lib/booster-data.ts` | 182 | Loads booster product data from Supabase |
| `src/lib/bot-drafter.ts` | ~150 | Bot AI: rarity-first selection with color commitment |
| `src/lib/bot-runner.ts` | ~80 | Executes bot picks inside `applyDraftMutation` |
| `src/lib/export.ts` | ~120 | Deck export: clipboard text, Cockatrice .cod XML, plain .txt |
| `src/components/draft/PickScreen.tsx` | 1,094 | Dual-mode pick screen: mobile carousel + desktop grid |
| `src/components/deck-builder/DeckBuilderScreen.tsx` | 673 | Deck builder with auto-save, land suggestions, export |

### Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts (dev/build/lint/test) |
| `tsconfig.json` | TypeScript strict mode, `@/*` path alias |
| `next.config.ts` | Image domains, security headers, Sentry integration |
| `postcss.config.mjs` | TailwindCSS 4 PostCSS plugin |
| `.env.example` | Environment variable template |
| `supabase/config.toml` | Local Supabase development config |

### Data Layer

| File | Purpose |
|------|---------|
| `src/lib/database.types.ts` | Auto-generated Supabase schema types |
| `src/lib/supabase.ts` | Browser client (publishable key) |
| `src/lib/supabase-server.ts` | Server client (cookie-based auth, `getUser()` memoized) |
| `src/lib/supabase-admin.ts` | Admin client (secret key, bypasses RLS) |
| `src/lib/supabase-middleware.ts` | Session refresh on every request |
| `supabase/migrations/*.sql` | 9 migrations: schema, RLS, realtime, invites, simulated drafts, booster tables |

### Frontend Components

**Draft components** (`src/components/draft/`):

| Component | Purpose |
|-----------|---------|
| `PickScreen.tsx` | Card selection — carousel (mobile) + grid (desktop) |
| `PickClient.tsx` | Realtime subscription wrapper for pick screen |
| `SetPicker.tsx` | Set/booster product selector |
| `WinstonDraftScreen.tsx` | Winston draft pile UI |
| `DraftLobby.tsx` | Pre-draft lobby with player list |
| `CreateDraftForm.tsx` | New draft configuration form |
| `PodMemberList.tsx` | Pod member avatars, pick status, direction arrows |
| `PodStatusOverlay.tsx` | Pod status as overlay |
| `PostDraftScreen.tsx` | Results: pick history, per-player picks, export |
| `WaitingScreen.tsx` | Waiting for other players |
| `BetweenPackScreen.tsx` | Pack transition screen |
| `PickedCardsDrawer.tsx` | Slide-out picked cards panel |

**Shared UI** (`src/components/ui/`):

| Component | Purpose |
|-----------|---------|
| `UserAvatar.tsx` | Image/emoji/letter avatar with sm/md/lg sizes |
| `CardThumbnail.tsx` | Card image with rarity border coloring |
| `CardPreview.tsx` | Enlarged card preview with DFC flip |
| `ManaCurve.tsx` | Mana curve bar chart visualization |
| `Timer.tsx` | Countdown timer with visual urgency |

### Testing

| File | Purpose |
|------|---------|
| `src/lib/__tests__/draft-engine.test.ts` | 88 unit tests for draft engine (Vitest) |
| `scripts/test-packs.ts` | Integration script: validate pack generation across all sets |

### DevOps / Monitoring

| File | Purpose |
|------|---------|
| `src/instrumentation.ts` | Sentry Node.js + Edge runtime init |
| `src/instrumentation-client.ts` | Sentry browser init (Turbopack-compatible) |
| `src/app/global-error.tsx` | Global error boundary → Sentry |
| `sentry.server.config.ts` | Server-side Sentry config |
| `sentry.edge.config.ts` | Edge runtime Sentry config |

---

## 4. API Endpoints

| Method | Path | Auth | Cache | Purpose |
|--------|------|------|-------|---------|
| GET | `/api/sets` | Public | 24h | List all draftable MTG sets |
| GET | `/api/boosters?set={code}` | Public | 24h | List booster products for a set |
| POST | `/api/avatar` | Required | None | Upload avatar image to Vercel Blob |
| POST | `/auth/signout` | Required | None | Sign out (cookie clear) |
| GET | `/monitoring` | Public | None | Sentry tunnel (ad-blocker bypass) |

**Server Actions** (not REST, invoked via React Server Actions):
- Draft lifecycle: create, start, pick, pass, advance pack, deck build, submit/unsubmit
- Group management: create, join, leave, update emoji, manage members
- Invite links: generate, revoke, accept
- Profile: update display name, avatar, bio, favorite color
- Proposals: create, vote, confirm

All server actions return `{ error: string }` on failure or `void`/redirect on success.

---

## 5. Architecture Deep Dive

### Application Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Vercel Edge                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Next.js 16 (App Router)                │  │
│  │                                                           │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  │  │
│  │  │   Server     │  │   Server     │  │   API Routes    │  │  │
│  │  │  Components  │  │   Actions    │  │  /api/sets      │  │  │
│  │  │  (data fetch)│  │  (mutations) │  │  /api/boosters  │  │  │
│  │  └──────┬───────┘  └──────┬───────┘  │  /api/avatar    │  │  │
│  │         │                 │          └────────┬────────┘  │  │
│  │         │                 │                   │           │  │
│  │  ┌──────▼─────────────────▼───────────────────▼────────┐  │  │
│  │  │              Supabase Client Layer                   │  │  │
│  │  │  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │  │  │
│  │  │  │ Browser  │  │  Server  │  │  Admin (secret)   │  │  │  │
│  │  │  │ (public) │  │ (cookie) │  │  (bypasses RLS)   │  │  │  │
│  │  │  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │  │  │
│  │  └───────┼──────────────┼─────────────────┼─────────────┘  │  │
│  └──────────┼──────────────┼─────────────────┼────────────────┘  │
└─────────────┼──────────────┼─────────────────┼──────────────────┘
              │              │                 │
              ▼              ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Supabase (Hosted)                           │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │
│  │ Postgres │  │   Auth   │  │ Realtime  │  │     RLS      │  │
│  │  (data)  │  │ (email/  │  │ (channel  │  │  (row-level  │  │
│  │          │  │  password)│  │  updates) │  │   security)  │  │
│  └──────────┘  └──────────┘  └───────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────────┘

External Services:
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Scryfall   │  │ Vercel Blob  │  │    Sentry    │
│  (card data  │  │  (avatar     │  │   (error     │
│   & images)  │  │   storage)   │  │  monitoring) │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Draft State Machine

```
                    ┌──────────┐
                    │  Created │
                    └────┬─────┘
                         │ addPlayer() / confirmDraft()
                         ▼
                    ┌──────────┐
                    │ Confirmed│
                    └────┬─────┘
                         │ startDraft() — generates packs
                         ▼
               ┌─────────────────┐
               │    Drafting      │◄─────────────────┐
               │  (pick phase)   │                   │
               └────────┬────────┘                   │
                        │                            │
          makePick() ───┤                            │
          passCurrentPacks()                         │
                        │                            │
                        ▼                            │
               ┌─────────────────┐    advanceToNextPack()
               │  Round Complete │───────────────────┘
               │ (all picked)    │    (more packs remain)
               └────────┬────────┘
                        │ (all packs done)
                        ▼
               ┌─────────────────┐
               │  Deck Building  │
               │  (build decks)  │
               └────────┬────────┘
                        │ all decks submitted
                        ▼
               ┌─────────────────┐
               │   Completed     │
               └─────────────────┘
```

### Data Flow: Making a Pick

```
1. User taps card → PickScreen (client component)
2. Calls server action: makePick(draftId, cardId)
3. Server action:
   a. Auth check (getUser)
   b. Fetch current draft state from DB
   c. Call draft-engine.makePickAndPass() — pure function
   d. applyDraftMutation() — optimistic concurrency write
   e. If simulated: run bot picks via bot-runner
4. Supabase Realtime broadcasts row change
5. All clients receive update via useRealtimeChannel
6. PickClient calls router.refresh() → re-fetches server data
```

### Realtime Architecture

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Player A │     │ Player B │     │ Player C │
│ (browser)│     │ (browser)│     │ (browser)│
└────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │
     │  Subscribe to  │                │
     │  drafts table  │                │
     │                │                │
     ▼                ▼                ▼
┌──────────────────────────────────────────┐
│         Supabase Realtime Channel        │
│     (postgres_changes on drafts table)   │
└──────────────────┬───────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────┐
│          PostgreSQL (drafts table)        │
│   state: JSONB  │  version: integer      │
│   (optimistic concurrency via version)   │
└──────────────────────────────────────────┘
```

---

## 6. Database Schema

### Core Tables

```
profiles          groups             group_members
├── id (FK auth)  ├── id             ├── id
├── display_name  ├── name           ├── group_id (FK)
├── avatar_url    ├── emoji          ├── user_id (FK)
├── bio           ├── description    └── role (admin/member)
└── favorite_color└── created_by (FK)

group_invites     draft_proposals    draft_players
├── id            ├── id             ├── id
├── group_id (FK) ├── group_id (FK)  ├── proposal_id (FK)
├── token (UUID)  ├── created_by     └── user_id (FK)
├── expires_at    ├── status
└── revoked       └── config (JSON)

drafts
├── id
├── group_id (FK, nullable for simulated)
├── is_simulated
├── state (JSONB — full Draft object)
├── version (optimistic concurrency)
└── created_at
```

### RLS Strategy

- All tables have RLS enabled
- `SECURITY DEFINER` helper functions avoid infinite recursion:
  - `user_group_ids()` — groups the current user belongs to
  - `user_draft_ids()` — drafts the current user participates in
  - `is_group_admin(group_id)` — admin check
- Server actions use admin client for draft mutations (bypasses RLS for atomic state updates)
- Defense-in-depth: server actions check authorization explicitly even with RLS

### Migrations (chronological)

1. `001_initial_schema` — Core tables, profiles, groups, drafts, RLS policies
2. `002_anon_invite_select_policy` — Allow anonymous users to read invite info
3. `003_add_drafts_version` — Optimistic concurrency version column
4. `004_enable_realtime` — Enable Realtime on drafts table
5. `005_join_group_rpc` — RPC for accepting group invites
6. `006_fix_rls_infinite_recursion` — SECURITY DEFINER helper functions
7. `007_simulated_drafts` — Nullable group_id, is_simulated flag
8. `008_group_invite_links` — Invite tokens with expiry
9. `009_booster_distribution_tables` — Products, configs, sheets for data-driven packs

---

## 7. Technology Stack Breakdown

### Runtime & Framework
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.1.6 | Full-stack React framework (App Router) |
| React | 19.2.4 | UI library |
| TypeScript | 5.x | Type safety (strict mode) |
| Node.js | (Vercel managed) | Server runtime |

### Database & Auth
| Technology | Purpose |
|------------|---------|
| Supabase (PostgreSQL) | Primary database with RLS |
| Supabase Auth | Email/password authentication |
| Supabase Realtime | Live draft state synchronization |
| `@supabase/ssr` 0.8.0 | Server-side cookie session management |
| `@supabase/supabase-js` 2.95.3 | JavaScript client |

### Styling & UI
| Technology | Version | Purpose |
|------------|---------|---------|
| TailwindCSS | 4.x | Utility-first CSS |
| `mana-font` | 1.18.0 | MTG mana symbol icons |
| `keyrune` | 3.18.0 | MTG set symbol icons |

### Storage & CDN
| Technology | Purpose |
|------------|---------|
| `@vercel/blob` 2.2.0 | Avatar image storage |
| Scryfall CDN | Card images (cards.scryfall.io) |
| Next.js Image | Image optimization proxy |

### Monitoring & Quality
| Technology | Version | Purpose |
|------------|---------|---------|
| `@sentry/nextjs` | 10.38.0 | Error tracking (client + server + edge) |
| Vitest | 4.0.18 | Unit testing (88 tests) |
| ESLint | 9.x | Code linting |

### Build & Deploy
| Technology | Purpose |
|------------|---------|
| Vercel | Hosting, serverless functions, preview deployments |
| Turbopack | Dev server bundler (Next.js default) |
| PostCSS | TailwindCSS processing |

---

## 8. Key Design Patterns

### Immutable State Machine (Draft Engine)
The draft engine (`draft-engine.ts`) is the architectural centerpiece — 1,092 lines of pure functions that transform immutable `Draft` objects. No side effects, no database calls, no React — just data in, data out. This makes it:
- Fully unit-testable (88 tests)
- Safe for optimistic concurrency (compare-and-swap on `version`)
- Shareable between human and bot players

### Three-Client Pattern (Supabase)
Three Supabase clients with escalating privileges:
1. **Browser** — public key, user-scoped RLS
2. **Server** — cookie auth, user-scoped RLS, `React.cache()` memoization
3. **Admin** — secret key, bypasses RLS, used only in server actions for atomic mutations

### Optimistic Concurrency
Draft state is a single JSONB column with a `version` integer. `applyDraftMutation()` reads current state, applies the pure engine function, then writes back with `WHERE version = expected_version`. Concurrent conflicting writes fail and retry.

### Mobile-First Responsive
The pick screen has completely separate mobile (carousel) and desktop (grid) implementations split by `sm:hidden` / `hidden sm:flex`. The mobile carousel uses raw DOM transforms with `requestAnimationFrame` — zero React re-renders during touch interactions.

### Server Actions Pattern
All mutations follow the same pattern:
```typescript
async function myAction(formData) {
  const user = await getUser();        // Auth check
  if (!user) return { error: "..." };  // Guard
  // Authorization check (membership/role)
  // Fetch current state
  // Apply mutation (pure function)
  // Write to DB (admin client)
  // Redirect or return void
}
```

---

## 9. Security Posture

| Category | Implementation |
|----------|---------------|
| **Authentication** | Supabase Auth (email/password), session cookies |
| **Authorization** | RLS + explicit server action checks (defense-in-depth) |
| **CSRF** | Server Actions use POST with origin validation |
| **XSS** | React's built-in escaping, no `dangerouslySetInnerHTML` |
| **Clickjacking** | `X-Frame-Options: DENY` header |
| **MIME sniffing** | `X-Content-Type-Options: nosniff` header |
| **Open redirect** | Login redirect param validated (starts with `/`, not `//`) |
| **Race conditions** | Optimistic concurrency + TOCTOU prevention on votes |
| **Data exposure** | RLS policies, SECURITY DEFINER helpers |
| **Error leakage** | Sentry captures errors; generic messages to users |
| **Dependency audit** | `npm audit`: 0 vulnerabilities |

---

## 10. Codebase Metrics

| Metric | Value |
|--------|-------|
| Source files (src/) | 91 .ts/.tsx |
| Total src lines (estimated) | ~12,000 |
| Largest file | `PickScreen.tsx` (1,094 lines) |
| Second largest | `draft-engine.ts` (1,092 lines) |
| Components | 17 (12 draft + 5 UI) |
| Server actions | ~20 across multiple action files |
| API routes | 3 REST + 1 tunnel |
| Database tables | ~10 core tables |
| Migrations | 9 |
| Unit tests | 88 |
| Dependencies | 8 production, 10 dev |
| TypeScript strictness | `strict: true`, zero `any`, zero `@ts-ignore` |
| Known lint issues | 11 warnings, 6 errors (pre-existing, hooks rules) |

---

## 11. Key Insights & Recommendations

### Strengths
- **Clean separation of concerns**: Draft engine is pure logic, completely decoupled from UI and database
- **Type safety**: Strict TypeScript throughout with no escape hatches
- **Security-conscious**: Multiple layers of protection, completed security audit
- **Performance**: Mobile carousel uses raw DOM manipulation, avoiding React render overhead during touch
- **Minimal dependencies**: Only 8 production deps — no bloated UI libraries

### Areas for Improvement

**Testing coverage**: Only the draft engine has unit tests. The following would benefit from testing:
- Pack generation logic (`generate-packs.ts`, `pack-generator.ts`, `sheet-pack-generator.ts`)
- Scryfall client edge cases (rate limiting, DFC normalization)
- Server action authorization checks
- Export functionality

**Large files**: `PickScreen.tsx` (1,094 lines) and `draft-engine.ts` (1,092 lines) are approaching sizes where extraction would improve maintainability. The pick screen's mobile carousel logic could be extracted to a custom hook or utility.

**Pre-existing lint issues**: 11 warnings and 6 errors (mostly React hooks dependency rules in PickScreen/PickClient/SetPicker). These are intentional in some cases (the carousel avoids re-renders by design) but should be documented with eslint-disable comments explaining why.

**CI/CD**: No GitHub Actions configuration detected. Adding automated lint, type-check, and test runs on PR would prevent regressions.

**E2E testing**: No integration or end-to-end tests. Playwright tests for critical flows (login → create draft → pick → deck build → export) would catch full-stack regressions.

**Database migrations**: All migrations are in-order numbered files without a down/rollback strategy. This is fine for the current stage but worth considering as the schema stabilizes.

---

*Generated by codebase analysis on February 15, 2026*
