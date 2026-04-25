# Codebase Audit — April 25, 2026

Follow-up audit to `CODEBASE_REVIEW.md` (Feb 16, 2026). The prior review's 30 issues across 7 PRs (#20–28) all shipped and verified. This audit covers the delta since (PRs #29–33) and any drift, with primary focus on **what's actually broken in production right now**.

Agents that contributed: security, correctness, performance, UX/A11y/iOS, deps/config/infra, test coverage.

---

## TL;DR

- **One feature is broken in prod**: avatar upload on iOS Safari. Three independent root causes stack on top of each other (no HEIC support, no try/catch in client handler, no error wrapping on server `put()`). All confirmed.
- **One systemic correctness bug**: four client fetch sites call `res.json()` without checking `res.ok` — same shape as the avatar bug, just hasn't bitten yet on the others.
- **One systemic security/dep issue**: `npm audit` shows 9 high / 6 moderate vulns, mostly transitive (vite, undici, serialize-javascript, uuid). Mostly dev-only but a few hit runtime.
- **Otherwise: solid.** Prior review's fixes are verified intact, no regressions, performance work from PR #26 confirmed effective. Most remaining items are polish/medium.

---

## 1. CRITICAL — Avatar upload broken on iOS Safari

Three layered problems. Fixing only one of them won't fully fix the feature.

### 1.1 No try/catch in `handleFileUpload`

**`src/app/(app)/dashboard/profile/ProfileForm.tsx:44-66`**

```ts
async function handleFileUpload(e) {
  ...
  const res = await fetch("/api/avatar", { method: "POST", body: formData });
  const data = await res.json();   // ← throws on non-JSON; uncaught promise rejection
  if (!res.ok) { setError(data.error ?? "Upload failed"); ... }
  ...
}
```

Any throw becomes `auto.browser.global_handlers.onunhandledrejection` in Sentry — exactly what PODMAN-4 reports. Also: on a thrown exception, `setUploading(false)` never runs and the button stays disabled forever.

**Fix:** wrap the body in try/catch, check `res.ok` *before* `.json()`, use `finally` for `setUploading(false)`, and `Sentry.captureException(err, { extra: { fileType: file.type, fileSize: file.size } })` in the catch.

### 1.2 HEIC/HEIF not in MIME allowlist

**`src/app/api/avatar/route.ts:27-33`**

iOS 11+ defaults photos to HEIC. iOS 18 Safari does not reliably auto-transcode to JPEG when uploading via `<input type=file>` — it depends on whether the picker source is Camera (transcodes) or Photos (often does not).

**Fix:** add `"image/heic": "heic"` and `"image/heif": "heif"` to the `MIME_TO_EXT` map. Update the input's `accept` attribute on the client to make this discoverable to Safari.

### 1.3 `put()` and DB update unguarded; non-JSON 500 leaks to client

**`src/app/api/avatar/route.ts:43-55`**

```ts
const blob = await put(`avatars/${user.id}.${ext}`, file, { ... });   // can throw
...
await supabase.from("profiles").update({ avatar_url: blob.url }).eq("id", user.id);
// no error check — silent success even if update fails
```

If `put()` throws (token rotated, quota exceeded, network), Next.js returns its default HTML 500 — which is what made PODMAN-4 fire on the client *before* we fixed the missing `BLOB_READ_WRITE_TOKEN` today. The DB update error is also silently swallowed; client gets 200 but DB row is unchanged.

**Fix:** wrap `put()` in try/catch, return `NextResponse.json({ error }, { status: 500 })`. Check the supabase response and return 500 on DB error.

### 1.4 Avatar URL not auto-saved (UX, not a bug per se)

After successful upload, `setAvatarUrl(data.url)` updates only client state — user must click "Save" or navigation drops the change. Ship this fix together with 1.1–1.3 or it'll feel half-broken.

**Fix:** call `updateProfile()` server action immediately after the upload succeeds, OR show a clear "Save changes" affordance.

### 1.5 Same fetch pattern repeats elsewhere — fix once, fix everywhere

Same `await res.json()`-without-`res.ok` shape:
- `src/app/(app)/crack-a-pack/CrackAPackClient.tsx:52-66`
- `src/components/draft/SetPicker.tsx:32-40`
- (audit didn't enumerate the 4th — grep `await res.json()` to find all)

Worth a single PR that adds a small `fetchJson()` helper that throws a typed error on non-OK or non-JSON, and migrates every callsite.

---

## 2. HIGH — Dependency vulnerabilities (`npm audit`)

15 vulns total: 9 high, 6 moderate. Mostly transitive, mostly dev-only. Run `npm audit fix` and review the diff.

| Package | Severity | Path | Notes |
|---|---|---|---|
| `vite` | HIGH | dev (vitest → vite) | 9 CVEs incl. path traversal, fs.deny bypass |
| `serialize-javascript` | HIGH | dev (rollup) | RCE via RegExp.flags |
| `undici` | HIGH | runtime (transitive) | WebSocket overflow, HTTP smuggling, CRLF — patches at ≥6.23.1 |
| `uuid` | MEDIUM | dev (@sentry/webpack-plugin) | Bounds check missing in v3/5/6 |

**Fix:** `npm audit fix` then verify build/tests still pass. Most should resolve via lockfile bumps without breaking changes.

---

## 3. HIGH — Optimistic update race in PickClient

**`src/app/(app)/draft/[draftId]/pick/PickClient.tsx:170-195`**

If user taps a second card while the first `makePickAction` is still in flight, `previousPacks` / `previousPicks` are captured from a stale closure over initial state — rollback restores the wrong state.

**Fix:** use functional `setState` updates and a small action queue (or disable the pick button while a pick is in flight, which is simpler and matches mobile UX expectations).

---

## 4. HIGH — Three a11y/UX issues that hurt iOS users

### 4.1 No success feedback after profile save (`ProfileForm.tsx:203-208`)
"Profile updated!" persists until the next submit. `router.refresh()` is correct but the success state isn't dismissed — feels frozen.
**Fix:** dismiss after 2-3s, or show a transient toast.

### 4.2 16px input rule violated → iOS zooms on focus
Inputs across forms use `text-sm` (14px). Mobile Safari auto-zooms when the user focuses any input under 16px — disorienting on the profile and login forms.
**Fix:** bump form input font-size to 16px on mobile breakpoints (`text-base sm:text-sm` or set on the `input` selector globally).

### 4.3 Modal focus not restored to trigger
`useFocusTrap` traps Tab/Shift+Tab inside an open modal but doesn't refocus the trigger element on close — keyboard users have to re-tab from the top.
**Fix:** save `document.activeElement` on open, focus it on close, in the existing hook.

---

## 5. MEDIUM

### 5.1 KV cache has no TTL or stampede protection (`src/lib/kv.ts:30-38`)
`kvSet` writes are indefinite. A bad value can persist forever. No early-expiration jitter on read.
**Fix:** add optional `exSeconds` param (24h default for booster data); add probabilistic early expiration at ~80% of TTL.

### 5.2 Realtime triggers full row refetch (`PickClient.tsx:141-168`)
On any draft row change, handler calls `router.refresh()` which re-deserializes the entire `state` JSON (~50-200KB on a 40-pick draft). Could pull just the changed field from the Realtime payload.
**Fix:** lower-priority — only matters if pick latency becomes a complaint. Document the tradeoff if leaving as-is.

### 5.3 Input validation gaps in proposal creation
**`src/app/(app)/dashboard/groups/[groupId]/actions.ts:11,15`** — `title` length not bounded, `playerCount` not validated client-side (relies on DB CHECK to fail with a generic error).
**Fix:** validate `1 ≤ title.length ≤ 200` and `2 ≤ playerCount ≤ 8` in the action; return user-friendly errors.

### 5.4 Color-contrast violations on small text
`text-foreground/30` on placeholders and `text-foreground/40` on the "Remove avatar" button fail WCAG AA at 12-14px sizes.
**Fix:** floor opacity at `/50` for placeholders, `/60` for any interactive small text.

### 5.5 Silent error swallowing in deck save (`PickClient.tsx:216-223`)
`saveDeckAction()` errors are caught and ignored — mid-draft deck edits can disappear.
**Fix:** surface a toast and retry once before giving up.

---

## 6. LOW

- **Outdated minor versions**: @sentry/nextjs (10.38 → 10.50), @supabase/supabase-js (2.95 → 2.104), Next 16.1.6 → 16.2.4, Tailwind/postcss, ESLint 9 → 10. Bump in batches between releases.
- **Env var documentation drift**: `.env.example` is missing `BLOB_READ_WRITE_TOKEN`. CLAUDE.md is missing `PROD_SUPABASE_URL`/`PROD_SUPABASE_SECRET_KEY` (used by backup scripts).
- **No pre-commit hooks**: optional husky+lint-staged would catch lint errors before CI.
- **Avatar `unoptimized` Image**: justified (Vercel Blob URLs pass through), but a `quality={80}` hint wouldn't hurt.
- **DFC backImageUri null fallback** (`DeckBuilderScreen.tsx:637`): use `??` to fall back to front face if missing.

---

## 7. Test coverage gaps (no urgency, but worth the effort)

Strengths: 212 unit tests on pure logic — draft engine, pack generation, card utils, exports. Solid.

Highest-leverage gaps:
1. **`applyDraftMutation` concurrency control** — version-conflict retry logic is the spine of every draft mutation and has zero tests.
2. **RLS policy regression tests** — Feb migration fixed infinite recursion in `group_members` policies; no test prevents recurrence. Doable with `supabase` local + a small integration suite.
3. **Server actions auth/membership** — `createGroup`, `leaveGroup`, `voteOnProposal` auto-confirm race — all untested.
4. **No E2E tests** — Playwright covering "create draft → 8 players join → pick all → submit → results" would catch regressions across the whole stack. ~200 lines of test code, ~10 min runtime.

---

## 8. What's verified clean (not re-flagged)

- All 1.1–1.8 fixes from `CODEBASE_REVIEW.md` shipped and intact.
- Performance work from PR #26 verified (narrow selects, parallel updates, no force-dynamic).
- Accessibility work from PR #27 intact (focus traps, ARIA, skip link).
- Security headers present, CSP Report-Only configured (consider enforcing in a future PR after a soak period).
- TypeScript strict mode on, ESLint coverage reasonable, .gitignore protects `.env*`.
- Sentry instrumentation and CI workflows healthy.
- Migrations follow naming convention, are idempotent.

---

## Suggested wave plan

**Wave 1 (this week — fix what's broken):**
- §1 avatar upload (1.1 + 1.2 + 1.3 + 1.4) — single PR.
- §1.5 fetch helper migration — separate PR.
- §2 `npm audit fix` — separate PR (small, low-risk).

**Wave 2 (next week — UX/correctness polish):**
- §3 PickClient race
- §4.1–4.3 a11y/UX
- §5.3 input validation

**Wave 3 (later — infra/coverage):**
- §5.1 KV TTL
- §6 dep bumps
- §7.1 + §7.2 highest-leverage tests
