# Codebase Review — February 2026

Comprehensive audit of the podman codebase covering security, code quality, performance, accessibility, infrastructure, and test coverage. Each issue includes the affected file(s), line numbers, severity, and an implementation plan with dependency analysis for parallel execution.

---

## Table of Contents

1. [Security](#1-security)
2. [Code Quality](#2-code-quality)
3. [Performance](#3-performance)
4. [Accessibility](#4-accessibility)
5. [Infrastructure & CI](#5-infrastructure--ci)
6. [Test Coverage](#6-test-coverage)
7. [SEO & Meta](#7-seo--meta)
8. [Parallel Execution Plan](#8-parallel-execution-plan)

---

## 1. Security

### 1.1 Missing group membership checks in server actions — HIGH

Several server actions verify authentication but do **not** verify the user belongs to the group before performing the operation. An authenticated user who knows a group/proposal/draft UUID can act on groups they don't belong to. CLAUDE.md documents `updateGroupEmoji` as the model pattern (check membership explicitly before DB ops); these actions don't follow it.

**Affected actions:**

| Action | File | Lines | Gap |
|--------|------|-------|-----|
| `createProposal` | `src/app/(app)/dashboard/groups/[groupId]/actions.ts` | 9–56 | No membership check before inserting a proposal |
| `voteOnProposal` | `src/app/(app)/dashboard/groups/[groupId]/actions.ts` | 58–108 | No membership check — outsiders can cast votes and trigger auto-confirm |
| `joinDraft` | `src/app/(app)/draft/[draftId]/actions.ts` | 132–150 | No check that user belongs to the draft's group |

RLS policies may block some of these at the DB layer, but the project's own security guidelines require defense-in-depth with explicit server-action checks.

**Fix:** Add a membership query before the main operation in each action, following the `updateGroupEmoji` pattern:
```ts
const { data: membership } = await supabase
  .from("group_members")
  .select("role")
  .eq("group_id", groupId)
  .eq("user_id", user.id)
  .single();
if (!membership) return { error: "Not a member of this group" };
```

### 1.2 `cancelProposal` uses client-supplied `groupId` for auth check — HIGH

`cancelProposal` (line 110–149) reads `groupId` from `formData.get("group_id")` and uses it to verify admin membership. A malicious user could supply a different `groupId` (one where they ARE admin) while targeting a `proposalId` in another group.

**File:** `src/app/(app)/dashboard/groups/[groupId]/actions.ts:130–136`

**Fix:** Use `proposal.group_id` (already fetched from the DB at line 122–126) instead of the client-supplied `groupId` for the membership check. Also add `.select("proposed_by, group_id")` to the proposal query.

### 1.3 `convertProposalToDraft` doesn't validate proposal ownership — MEDIUM

`convertProposalToDraft` (line 151–223) fetches a proposal by `proposalId` but never verifies `proposal.group_id === groupId`. A member of group A who knows a confirmed proposal ID from group B could convert it.

**File:** `src/app/(app)/dashboard/groups/[groupId]/actions.ts:163–167`

**Fix:** Add `.eq("group_id", groupId)` to the proposal query at line 165, or check `proposal.group_id === groupId` after fetch.

### 1.4 Unguarded `JSON.parse` on client input — MEDIUM

`createProposal` calls `JSON.parse(configJson)` on raw FormData (line 25) with no try/catch. Malformed JSON throws an unhandled exception. No schema validation is applied to the parsed object.

**File:** `src/app/(app)/dashboard/groups/[groupId]/actions.ts:25`

**Fix:** Wrap in try/catch, return `{ error: "Invalid config" }` on parse failure. Optionally validate the parsed shape.

### 1.5 `joinDraft` / `leaveDraft` silently swallow DB errors — MEDIUM

`joinDraft` (line 144–148) inserts into `draft_players` without checking the result. If the insert fails (RLS violation, draft full, constraint error), the error is silently lost. Same for `leaveDraft` (line 156–160).

**File:** `src/app/(app)/draft/[draftId]/actions.ts:132–163`

**Fix:** Check the `error` from the insert/delete response and return `{ error: string }` on failure.

### 1.6 Avatar upload doesn't validate file extension — LOW

The avatar upload endpoint (line 26–27) extracts the file extension from the client-supplied filename with no allowlist. While `file.type.startsWith("image/")` is checked, a client could upload `image/png` with a `.html` extension. Vercel Blob doesn't execute files, but the extension could be misleading.

**File:** `src/app/api/avatar/route.ts:26–27`

**Fix:** Derive the extension from the validated MIME type, or check against an allowlist (`["jpg","jpeg","png","gif","webp","avif"]`).

### 1.7 Missing `SET search_path = ''` on SECURITY DEFINER function — LOW

`get_booster_product_json` uses `SECURITY DEFINER` (line 9) without `SET search_path = ''`, inconsistent with all other SECURITY DEFINER functions in the codebase. This is a minor search-path injection risk.

**File:** `supabase/migrations/20260215000200_get_booster_product_json.sql:9`

**Fix:** New migration that recreates the function with `SET search_path = ''` added between `SECURITY DEFINER` and `AS $$`.

### 1.8 No Content-Security-Policy header — LOW

`next.config.ts` sets X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy, but has no Content-Security-Policy header. CSP would help mitigate XSS attacks.

**File:** `next.config.ts:17–28`

**Fix:** Add a CSP header. Start with a report-only policy to avoid breaking the app, then tighten:
```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' cards.scryfall.io *.public.blob.vercel-storage.com; connect-src 'self' *.supabase.co *.upstash.io *.sentry.io;
```

---

## 2. Code Quality

### 2.1 Duplicated `isCreature` function — 4 copies — MEDIUM

The same function (`card.typeLine?.toLowerCase().includes("creature")`) appears in four files:

| File | Line |
|------|------|
| `src/components/draft/PickScreen.tsx` | 59 |
| `src/components/deck-builder/DeckBuilderScreen.tsx` | 105 |
| `src/components/draft/PostDraftScreen.tsx` | 35 |
| `src/lib/bot-drafter.ts` | 76 |

**Fix:** Extract to a shared utility in `src/lib/card-utils.ts`, export and import everywhere.

### 2.2 Duplicated `getBorderClass` function — 2 copies — MEDIUM

Identical implementations in:
- `src/components/ui/CardThumbnail.tsx:17`
- `src/components/draft/PickScreen.tsx:100`

**Fix:** Export from `CardThumbnail.tsx` (or move to `card-utils.ts`) and import in `PickScreen`.

### 2.3 Duplicated `suggestLands` logic — MEDIUM

`DeckBuilderScreen.tsx:254–290` reimplements the land suggestion algorithm that already exists as `suggestLandCounts` in `src/lib/draft-engine.ts:983–1030`. These could diverge.

**Fix:** Import and call `suggestLandCounts` from the engine instead of reimplementing it locally.

### 2.4 `RARITY_ORDER` defined 3 times with inverted semantics — LOW

| File | Line | Ordering |
|------|------|----------|
| `src/lib/draft-engine.ts` | 52 | 0=common, 3=mythic (ascending) |
| `src/components/deck-builder/DeckBuilderScreen.tsx` | 57 | 0=mythic, 3=common (descending) |
| `src/components/draft/PickedCardsDrawer.tsx` | 27 | Array `["mythic","rare","uncommon","common"]` |

The different orderings serve different purposes (engine picks highest rarity, UI sorts descending). Not a bug, but confusing without comments.

**Fix:** Add a canonical `RARITY_ORDER` in `card-utils.ts` and derive the inverted version, or at minimum add comments explaining the intentional differences.

### 2.5 Dead/unused code — LOW

| Location | Issue |
|----------|-------|
| `src/app/(app)/draft/[draftId]/actions.ts:310` | `_remainingPacks` — computed, never read |
| `src/app/(app)/draft/[draftId]/pick/PickClient.tsx:52–53` | `_packsPerPlayer`, `_deckBuildingEnabled` — destructured with underscore, never used |
| `src/lib/generate-packs.ts:102–117` | `boosterDataBySet` Map — built but never consumed (pre-warm effect works through L1 cache side-effect, but Map is misleading) |
| `src/app/(app)/draft/[draftId]/actions.ts:95` | Tautological ternary: `status === "deck_building" ? "deck_building" : status` always returns `status` |

**Fix:** Remove dead variables. Simplify the tautological ternary to just `updatePayload.status = updatedDraft.status`. For `generateMixedPacks`, either pass the pre-loaded data to `generatePacksForSet` or simplify to a fire-and-forget pre-warm without building the Map.

### 2.6 Duplicated `executeSql` / `esc` in `load-booster-data.ts` — LOW

`scripts/load-booster-data.ts` has its own copies of `executeSql` (line 98, with `.slice(0, 300)` truncation) and `esc` (line 54) instead of importing from `scripts/supabase-api.ts`.

**File:** `scripts/load-booster-data.ts`

**Fix:** Import the shared versions from `supabase-api.ts`.

### 2.7 `startDraftAction` inconsistency — throws vs `{ error }` pattern — LOW

`startDraftAction` (line 165–339) throws raw errors (`throw new Error(...)`) instead of returning `{ error: string }`. The client catches these in a try/catch, which works, but it's inconsistent with the documented server action pattern of returning `{ error }`.

**Fix:** Convert to the `{ error }` return pattern for consistency with the rest of the codebase.

---

## 3. Performance

### 3.1 N+1 sequential seat position updates — MEDIUM

`startDraftAction` runs one `UPDATE` per player in a loop (lines 285–291 and 315–321). For an 8-player draft, this is 8 sequential DB round-trips.

**File:** `src/app/(app)/draft/[draftId]/actions.ts:285–291, 315–321`

**Fix:** Replace the for-loop with `Promise.all`:
```ts
await Promise.all(shuffledPlayers.map((p, i) =>
  admin.from("draft_players").update({ seat_position: i })
    .eq("draft_id", draftId).eq("user_id", p.user_id)
));
```

### 3.2 `select("*")` on drafts table fetches full state JSON — MEDIUM

The lobby page (line 22) and `startDraftAction` (line 172) use `select("*")` on the `drafts` table, which fetches the `state` column (potentially hundreds of KB of card data) and `config` (with `allPacks` — up to 336 card objects). The lobby only needs a few config fields.

**Files:**
- `src/app/(app)/draft/[draftId]/lobby/page.tsx:22`
- `src/app/(app)/draft/[draftId]/actions.ts:172`

**Fix:** Replace `select("*")` with explicit column lists:
```ts
// lobby — only needs config fields, not state
supabase.from("drafts").select("id, host_id, group_id, format, set_code, set_name, status, config, created_at")

// startDraftAction — needs host_id, status, format, set_code, set_name, config
admin.from("drafts").select("host_id, status, format, set_code, set_name, config")
```

### 3.3 Duplicate profile fetch (layout + page) — LOW

The app layout (`src/app/(app)/layout.tsx:19–27`) fetches the user's profile on every navigation. Dashboard and other pages also independently fetch the same profile. This results in 2 identical queries per request.

**Fix:** Create a `React.cache`-wrapped `getProfile(userId)` helper in `supabase-server.ts` and use it from both the layout and individual pages.

### 3.4 No lazy loading for heavy client components — LOW

`DeckBuilderScreen` is always imported in `PickScreen.tsx` (line 8) even though it only renders inside a conditionally-shown overlay (`showDeckBuilder`). No use of `next/dynamic` or `React.lazy` anywhere in the codebase.

**File:** `src/components/draft/PickScreen.tsx:8`

**Fix:** Use `next/dynamic` for `DeckBuilderScreen`:
```ts
const DeckBuilderScreen = dynamic(() => import("@/components/deck-builder/DeckBuilderScreen"), { ssr: false });
```

### 3.5 `force-dynamic` on `/api/boosters` may break CDN caching — LOW

The route is marked `force-dynamic` (line 4) and sets a manual `Cache-Control: public, s-maxage=86400` header. However, `force-dynamic` opts out of the full-route cache and may prevent Vercel's CDN from caching correctly. The `/api/sets` route uses `revalidate` which is the recommended Next.js approach.

**File:** `src/app/api/boosters/route.ts:4`

**Fix:** Replace `force-dynamic` with `export const revalidate = 86400` to let Next.js handle CDN caching correctly. Use `dynamic = "force-dynamic"` only for the query-param-dependent logic (or restructure as a dynamic segment).

### 3.6 `allPacks` deserialized on every pick — LOW

Every `applyDraftMutation` call (line 63–66) fetches the `config` column which contains the full `allPacks` array (up to 336 card objects). This is deserialized from Postgres JSON on every single pick action. Only `advanceToNextPack` actually needs allPacks.

**File:** `src/app/(app)/draft/[draftId]/actions.ts:63–66`

**Fix:** This is a deeper architectural issue. Possible approaches: (a) store allPacks in a separate column fetched only when needed, (b) store remaining packs only, removing distributed ones, (c) accept the current cost since it's bounded and fast enough for the use case. Recommend documenting the decision if keeping the current approach.

---

## 4. Accessibility

### 4.1 Modal dialogs lack focus management — HIGH

All three modal dialogs have `role="dialog"` and `aria-modal="true"` but none of them:
1. Move focus into the dialog on open
2. Trap focus within the dialog (Tab cycles within)
3. Return focus to the trigger element on close

**Files:**
- `src/components/draft/PickScreen.tsx:688–771` (desktop card preview modal)
- `src/components/deck-builder/DeckBuilderScreen.tsx:652–690` (card preview modal)
- `src/components/draft/PostDraftScreen.tsx:360–407` (card preview modal)

**Fix:** Create a shared `FocusTrap` component or use the native `<dialog>` element (which provides focus management automatically). Apply to all three modals:
```tsx
// On open: ref.current?.focus() on the dialog container (needs tabIndex={-1})
// Trap: onKeyDown handler that wraps Tab between first and last focusable element
// On close: restore focus to the element that triggered the modal
```

### 4.2 `LongPressPickButton` not keyboard accessible — HIGH

The pick button on mobile (lines 115–170) uses only `onMouseDown`/`onMouseUp` and `onTouchStart`/`onTouchEnd`. There is no `onClick` or `onKeyDown` handler, making it completely inaccessible to keyboard users.

**File:** `src/components/draft/PickScreen.tsx:115–170`

**Fix:** Add an `onClick` handler as a keyboard-accessible fallback. For the long-press pattern, also handle `onKeyDown`/`onKeyUp` for Enter/Space:
```tsx
onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") startPress(); }}
onKeyUp={(e) => { if (e.key === "Enter" || e.key === " ") endPress(); }}
```

### 4.3 Color filter buttons lack accessible labels — MEDIUM

Desktop filter buttons (lines 396–408) render only a mana icon `<i>` element with no visible text and no `aria-label`. Screen readers announce nothing useful. The `label` property exists in `COLOR_FILTERS` but is never rendered.

**File:** `src/components/draft/PickScreen.tsx:385–427`

**Fix:** Add `aria-label={opt.label}` and `aria-pressed={activeFilters.has(opt.value)}` to each filter button.

### 4.4 Scrub bar not keyboard accessible — MEDIUM

The carousel scrub bar (lines 572–605) is a `div` with `onClick` and touch handlers but no `role`, `tabIndex`, or keyboard support.

**File:** `src/components/draft/PickScreen.tsx:572–605`

**Fix:** Add `role="slider"`, `tabIndex={0}`, `aria-valuemin={0}`, `aria-valuemax={filteredCards.length - 1}`, `aria-valuenow={activeIndex}`, `aria-label="Card scrubber"`, and arrow key handlers.

### 4.5 Backdrop close divs not keyboard accessible — LOW

Several modal backdrops use `<div onClick={onClose}>` with no `role`, `tabIndex`, or keyboard handler.

**Files:** `src/components/draft/PodStatusOverlay.tsx:25–27`, `PickScreen.tsx:688–691`, `PostDraftScreen.tsx:360–362`

**Fix:** The backdrop doesn't need to be focusable — Escape key support (already present) is sufficient. But add `role="presentation"` to clarify intent for assistive tech.

### 4.6 No skip-to-content link — LOW

The app layout has a `<main>` element but no "skip to main content" link for keyboard users.

**File:** `src/app/(app)/layout.tsx:30–56`

**Fix:** Add a visually-hidden skip link as the first child of the layout:
```tsx
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 ...">
  Skip to main content
</a>
// ... and on main:
<main id="main-content" className="flex-1">{children}</main>
```

---

## 5. Infrastructure & CI

### 5.1 `tsx` not in devDependencies — HIGH

All scripts use `npx tsx` but `tsx` does not appear in `package.json`. `npx` downloads it on-demand, introducing latency and potential version inconsistency. The CI workflow `update-sets.yml` downloads tsx fresh each run.

**File:** `package.json`

**Fix:** `npm install --save-dev tsx`

### 5.2 No `process.exit(1)` on sync failures — MEDIUM

`scripts/load-booster-data.ts` (line 363–366) logs failed products but exits with code 0. The daily GitHub Actions workflow reports success even on partial failures.

**File:** `scripts/load-booster-data.ts:363–366`

**Fix:** Add `process.exit(1)` at the very end of `main()` (after KV cache invalidation and summary print), not immediately after the error count log — otherwise the KV invalidation step would be skipped:
```ts
// At the end of main(), after all cleanup:
if (errors > 0) process.exit(1);
```

### 5.3 Orphaned migration for dropped table — INFO

Migration `20260212000000_anon_invite_select_policy.sql` creates RLS policies on the `public.invites` table, which is later dropped entirely by `20260214000100_group_invite_links.sql`. The earlier migration is logically dead. No action needed — both have already been applied. Noted for documentation purposes only.

### 5.4 No CI failure notification — LOW

Neither `ci.yml` nor `update-sets.yml` have Slack/email/GitHub notification on failure. A silent failure of the daily set sync could go unnoticed.

**Fix:** Add a notification step using GitHub Actions' built-in email notifications (enabled in repo settings) or a Slack webhook integration.

---

## 6. Test Coverage

### 6.1 Current state

Only `src/lib/draft-engine.ts` has tests — 88 test cases in `src/lib/__tests__/draft-engine.test.ts` (1,221 lines). This covers the draft lifecycle, pick mechanics, Winston, deck building, and seat hydration.

### 6.2 Untested areas, prioritized

| Priority | Module | Why it matters |
|----------|--------|----------------|
| **High** | `src/lib/scryfall.ts` — `normalizeForScryfall()` | Has documented edge cases (DFC suffixes, star `★`, "The List" format), a dedicated fix doc in `docs/`. Prime candidate for regression tests. |
| **High** | `src/lib/export.ts` | Deck export (clipboard, .cod, .txt). Pure functions, easy to test, user-visible output format. |
| **Medium** | `src/lib/sheet-pack-generator.ts` | Core pack generation with weighted random selection. Algorithmic code where bugs affect gameplay. |
| **Medium** | `src/lib/pack-generator.ts` | Template-based fallback generation. Same concern. |
| **Medium** | `src/lib/bot-drafter.ts` | Bot AI logic (rarity-first, color-commit). Algorithmic, pure functions. |
| **Low** | `src/lib/generate-packs.ts` | Orchestration logic — `stripNonFoilBasicLands`, path selection. |
| **Low** | `src/lib/kv.ts` | Redis wrapper — simple but could be tested with mocks. |

### 6.3 Missing `vitest.config.ts`

Vitest runs without explicit config. This works for the current test file (which uses relative imports), but if any future test imports a module that uses the `@/*` path alias, it will fail.

**Fix:** Add a minimal `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

---

## 7. SEO & Meta

### 7.1 No per-page metadata — MEDIUM

Every page inherits the root layout's `metadata = { title: "podman", description: "..." }`. No individual pages export `metadata` or `generateMetadata`. Browser tabs, bookmarks, and search results all show the same generic title.

**Fix:** Add `metadata` exports to key pages:
```ts
// src/app/auth/login/page.tsx
export const metadata = { title: "Sign In — podman" };

// src/app/auth/signup/page.tsx
export const metadata = { title: "Sign Up — podman" };

// src/app/(app)/dashboard/page.tsx
export const metadata = { title: "Dashboard — podman" };

// src/app/(app)/crack-a-pack/page.tsx
export const metadata = { title: "Crack a Pack — podman" };
```

For dynamic pages (draft lobby, group pages), use `generateMetadata`:
```ts
export async function generateMetadata({ params }) {
  const { groupId } = await params;
  // fetch group name...
  return { title: `${groupName} — podman` };
}
```

### 7.2 No OpenGraph tags — LOW

The root metadata has no `openGraph` or `twitter` properties. Links shared on Discord/Slack/social media render with no image or description.

**Fix:** Add to root layout metadata:
```ts
openGraph: {
  title: "podman",
  description: "Draft Magic: The Gathering with friends",
  url: "https://www.podman.app",
  siteName: "podman",
  type: "website",
},
```

### 7.3 Invite page has no rich preview — LOW

The `/invite/[token]` page is public-facing and typically shared via messaging. Adding OG tags with the group name would make shared links render as rich previews.

**Fix:** Add `generateMetadata` to `src/app/invite/[token]/page.tsx` that fetches the group name from the invite token.

---

## 8. Parallel Execution Plan

### Dependency Graph

The key question for parallel work is: **which changes touch overlapping files?** If two branches modify the same file, they'll conflict on merge. Here's the analysis:

```
WORKSTREAM A: Security (group actions + draft actions)
  Files: groups/[groupId]/actions.ts, draft/[draftId]/actions.ts, api/avatar/route.ts
  Migration: new .sql file

WORKSTREAM B: Code Quality (card-utils extraction + dead code removal)
  Files: src/lib/card-utils.ts (NEW), PickScreen.tsx, DeckBuilderScreen.tsx,
         PostDraftScreen.tsx, bot-drafter.ts, CardThumbnail.tsx,
         draft/[draftId]/actions.ts, pick/PickClient.tsx, generate-packs.ts,
         scripts/load-booster-data.ts

WORKSTREAM C: Performance (queries + caching + lazy load)
  Files: lobby/page.tsx, draft/[draftId]/actions.ts, supabase-server.ts,
         layout.tsx, PickScreen.tsx, api/boosters/route.ts

WORKSTREAM D: Accessibility (modals + keyboard + ARIA)
  Files: PickScreen.tsx, DeckBuilderScreen.tsx, PostDraftScreen.tsx,
         PodStatusOverlay.tsx, layout.tsx

WORKSTREAM E: Infrastructure (deps + scripts + config)
  Files: package.json, scripts/load-booster-data.ts, vitest.config.ts (NEW),
         next.config.ts

WORKSTREAM F: Tests (new test files only)
  Files: src/lib/__tests__/scryfall.test.ts (NEW),
         src/lib/__tests__/export.test.ts (NEW), etc.

WORKSTREAM G: SEO (metadata exports)
  Files: src/app/layout.tsx (ROOT layout, NOT app layout),
         auth/login/page.tsx, auth/signup/page.tsx,
         dashboard/page.tsx, invite/[token]/page.tsx, etc.
```

### Conflict Matrix

Files touched by multiple workstreams (potential merge conflicts):

| File | Workstreams | Risk |
|------|-------------|------|
| `draft/[draftId]/actions.ts` | A, B, C | **HIGH** — all three modify this file |
| `PickScreen.tsx` | B, C, D | **HIGH** — three workstreams touch this |
| `DeckBuilderScreen.tsx` | B, D | Medium |
| `PostDraftScreen.tsx` | B, D | Medium |
| `src/app/(app)/layout.tsx` | C, D | Medium (C: lines 19–27, D: lines 32+55 — adjacent but not overlapping) |
| `src/app/layout.tsx` | G only | None (root layout metadata — separate file from app layout) |
| `scripts/load-booster-data.ts` | B, E | Low (different sections) |
| `next.config.ts` | E only | None |
| `package.json` | E only | None |

### Recommended Execution Order

Given the conflicts above, **fully parallel execution of all 7 workstreams is not safe**. Instead, use this staged approach that maximizes parallelism while avoiding painful merges:

```
                        ┌─────────────────────────────────┐
 WAVE 1 (parallel)      │  A: Security    E: Infra        │
 No file overlaps       │  F: Tests       G: SEO          │
 between these four     └──────────┬──────────────────────┘
                                   │ merge all four
                                   ▼
                        ┌─────────────────────────────────┐
 WAVE 2 (parallel)      │  B: Code Quality                │
 Both branch from       │  C: Performance                 │
 updated main           └──────────┬──────────────────────┘
                                   │ merge B first, then rebase C
                                   ▼
                        ┌─────────────────────────────────┐
 WAVE 3 (sequential)    │  D: Accessibility               │
 Branches from main     │  (touches files modified by B+C)│
 after B+C merged       └─────────────────────────────────┘
```

### Wave 1 — Fully Parallel (no conflicts)

These four workstreams touch completely different files and can run simultaneously:

#### PR #1: `security-hardening-2`
- **Files:** `groups/[groupId]/actions.ts`, `draft/[draftId]/actions.ts` (membership checks only — top of functions), `api/avatar/route.ts`, new migration `.sql`
- **Scope:** Issues 1.1–1.7
- **Priority:** Highest — fixes authorization gaps
- **Estimated changes:** ~80 lines added across 3 files + 1 new migration

#### PR #2: `infra-improvements`
- **Files:** `package.json`, `scripts/load-booster-data.ts` (exit code only), `vitest.config.ts` (NEW), `next.config.ts` (CSP header)
- **Scope:** Issues 5.1, 5.2, 6.3, 1.8
- **Priority:** High — fixes CI reliability
- **Estimated changes:** ~30 lines across 4 files

#### PR #3: `add-unit-tests`
- **Files:** All NEW test files in `src/lib/__tests__/`
- **Scope:** Issue 6.2 (normalizeForScryfall, export, etc.)
- **Priority:** Medium — prevents regressions
- **Estimated changes:** ~300–500 lines of new test files
- **No conflicts:** Only creates new files

#### PR #4: `seo-metadata`
- **Files:** `src/app/layout.tsx` (root layout metadata only — **not** `src/app/(app)/layout.tsx`), various `page.tsx` files (adding `metadata` exports)
- **Scope:** Issues 7.1–7.3
- **Priority:** Low — improves link sharing
- **Estimated changes:** ~60 lines across 8 files
- **Note:** The root layout (`src/app/layout.tsx`) is a different file from the app layout (`src/app/(app)/layout.tsx`). Wave 2/3 changes only touch the app layout, so there are zero conflicts

**Merge order:** Any order. All four target different files.

### Wave 2 — Parallel with Careful Merge Order

After Wave 1 is merged, branch from updated `main`:

#### PR #5: `code-quality-cleanup`
- **Files:** `card-utils.ts` (NEW), `PickScreen.tsx`, `DeckBuilderScreen.tsx`, `PostDraftScreen.tsx`, `bot-drafter.ts`, `CardThumbnail.tsx`, `draft/[draftId]/actions.ts` (dead code lines), `pick/PickClient.tsx`, `generate-packs.ts`, `scripts/load-booster-data.ts`
- **Scope:** Issues 2.1–2.7
- **Estimated changes:** ~100 lines new, ~80 lines removed across 10 files

#### PR #6: `performance-improvements`
- **Files:** `lobby/page.tsx`, `draft/[draftId]/actions.ts` (select queries), `supabase-server.ts`, `PickScreen.tsx` (dynamic import), `api/boosters/route.ts`
- **Scope:** Issues 3.1–3.5
- **Estimated changes:** ~50 lines changed across 5 files

**Merge strategy:** Merge PR #5 first (more files touched). Then rebase PR #6 onto updated `main` — the conflicts will be limited to `actions.ts` (different sections: dead code vs query changes) and `PickScreen.tsx` (imports only), which are trivial to resolve.

### Wave 3 — Sequential After Wave 2

#### PR #7: `accessibility-improvements`
- **Files:** `PickScreen.tsx`, `DeckBuilderScreen.tsx`, `PostDraftScreen.tsx`, `PodStatusOverlay.tsx`, `layout.tsx`
- **Scope:** Issues 4.1–4.6
- **Estimated changes:** ~150 lines across 5 files
- **Why last:** Modifies JSX in the same files as Waves 1–2. Doing this last means all prior refactors are settled and the accessibility changes apply cleanly.

### Step-by-Step Workflow

Here's the exact sequence for a single person or team:

```bash
# ── WAVE 1: Start all four branches from main ──

git checkout main && git pull

# Branch A: Security
git checkout -b security-hardening-2
# ... make changes, commit, push ...
gh pr create

# Branch E: Infrastructure
git checkout main
git checkout -b infra-improvements
# ... make changes, commit, push ...
gh pr create

# Branch F: Tests
git checkout main
git checkout -b add-unit-tests
# ... make changes, commit, push ...
gh pr create

# Branch G: SEO
git checkout main
git checkout -b seo-metadata
# ... make changes, commit, push ...
gh pr create

# Wait for CI on all four → test on preview URLs → merge all four
gh pr merge security-hardening-2
gh pr merge infra-improvements
gh pr merge add-unit-tests
gh pr merge seo-metadata

# ── WAVE 2: Branch from updated main ──

git checkout main && git pull

# Branch B: Code Quality
git checkout -b code-quality-cleanup
# ... make changes, commit, push ...
gh pr create

# Branch C: Performance (can start in parallel)
git checkout main
git checkout -b performance-improvements
# ... make changes, commit, push ...
gh pr create

# Merge B first (more files), then rebase C
gh pr merge code-quality-cleanup
git checkout performance-improvements && git pull --rebase origin main
# Resolve any minor conflicts in actions.ts / PickScreen.tsx
git push --force-with-lease
gh pr merge performance-improvements

# ── WAVE 3: Branch from updated main ──

git checkout main && git pull

# Branch D: Accessibility
git checkout -b accessibility-improvements
# ... make changes, commit, push ...
gh pr create
# Wait for CI → test → merge
gh pr merge accessibility-improvements
```

### Handling Merge Conflicts

When conflicts arise (most likely in Wave 2), here's how to resolve them:

1. **`draft/[draftId]/actions.ts`** (B vs C — **most likely conflict**) — Both modify `startDraftAction`. B changes lines 176–178 (throw→return) and removes line 310. C changes line 172 (select columns) and rewrites lines 285–291, 315–321 (batch seat updates). These edits are interleaved within the same function, so git diff context windows will overlap. **Resolution:** After merging B, rebase C. The conflicts will be in `startDraftAction` — accept C's changes for the select/batch sections while keeping B's throw→return conversion. Both sets of changes are semantically independent.

2. **`PickScreen.tsx`** (B→C→D across waves) — B removes `isCreature` (lines 59–62) and `getBorderClass` (lines 100–104), shifting everything below by ~9 lines. C changes the import at line 8 (unaffected by B's deletions). D (Wave 3) adds ARIA attributes to elements at lines 115+, 385+, 572+, 688+ — all shifted by B's deletions. Since D branches from main *after* B and C are merged, the line numbers will already reflect B's changes. **No manual resolution needed** — just branch D from updated main.

3. **`src/app/(app)/layout.tsx`** (C→D across waves) — C rewrites the profile fetch (lines 19–27) to use a cached helper, potentially shrinking the block. D adds a skip link before line 32 and `id="main-content"` on line 55. Since D branches after C, the line numbers will already reflect C's changes. **No manual resolution needed.**

4. **General rule:** If a rebase has conflicts, look at which sections each branch modified. Accept both changes (they shouldn't overlap semantically) and verify the result compiles.

### Tracking Progress

Use GitHub Projects or a simple issue checklist:

- [ ] **Wave 1** — 4 PRs
  - [ ] PR #1: Security hardening (`security-hardening-2`)
  - [ ] PR #2: Infrastructure (`infra-improvements`)
  - [ ] PR #3: Unit tests (`add-unit-tests`)
  - [ ] PR #4: SEO metadata (`seo-metadata`)
- [ ] **Wave 2** — 2 PRs (after Wave 1 merged)
  - [ ] PR #5: Code quality (`code-quality-cleanup`)
  - [ ] PR #6: Performance (`performance-improvements`)
- [ ] **Wave 3** — 1 PR (after Wave 2 merged)
  - [ ] PR #7: Accessibility (`accessibility-improvements`)

### Verification Notes

The parallel execution plan was verified line-by-line against the actual codebase. Key findings:

1. **Wave 1 zero-overlap: CONFIRMED.** Workstreams A, E, F, G touch completely separate files.
2. **Wave 2 B↔C conflict in `actions.ts`: CONFIRMED.** Both modify `startDraftAction` with interleaved changes (B: lines 95, 176–178, 310; C: lines 172, 285–291, 315–321). Merge B first, then rebase C — conflicts are resolvable since edits are semantically independent.
3. **G targets root layout: CONFIRMED.** `src/app/layout.tsx` (metadata export) is a different file from `src/app/(app)/layout.tsx` (app shell JSX). G has zero overlap with C and D.
4. **B's deletions in PickScreen shift D's targets by ~9 lines.** Not a problem since D branches after B merges.
5. **`role="presentation"` already exists on inner backdrop divs** in PickScreen and PostDraftScreen. D should add it to the outer backdrop `div` elements, or skip if Escape key support is sufficient.
6. **`process.exit(1)` must go at end of `main()`**, after KV invalidation — not immediately after the error count, which would skip cache cleanup.

### Time Estimates

Not providing detailed time estimates (per CLAUDE.md guidance), but relative sizing:

| PR | Size | Notes |
|----|------|-------|
| Security | Small | Mostly adding guard clauses |
| Infrastructure | Small | Config changes + 1-liner fixes |
| Tests | Medium–Large | Writing new test suites from scratch |
| SEO | Small | Adding metadata exports |
| Code Quality | Medium | Extracting shared code, updating imports |
| Performance | Small–Medium | Query changes, caching helpers |
| Accessibility | Medium | Focus trap implementation, ARIA work |
