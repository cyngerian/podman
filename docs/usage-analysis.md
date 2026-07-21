# Usage Analysis — Free-Tier Allotments & Per-Draft Consumption

<!-- last_updated: 2026-07-21 -->

Answers: how much of each free-tier quota does one full 6-player draft consume,
how many drafts/month fit, and which quota runs out first.

> **Update 2026-07-21 (task podman-12):** the two egress mitigations below have
> shipped. The pick screen now reads through the `get_draft_pick_view` RPC
> instead of selecting the whole `drafts.state`, and the waiting-screen poll
> went 2s → 8s. Numbers below are split into **before** and **after**; §5
> records the measurement.

## TL;DR

- **Supabase database egress (5 GB/mo) is no longer the binding constraint.**
  It *was*: a 6-player draft used to trigger ~7,000 full-state refetches
  (realtime + the 2-second polling fallback), each pulling the whole
  `drafts.state` JSON — **0.26–1.3 GB per draft → roughly 4–19 drafts/month**.
  After podman-12 it's ~2,970 refetches × ~13.6 KB → **~8–40 MB per draft →
  roughly 125–625 drafts/month** (~32x better, measured on a real draft — §5).
- **Binding constraint is now Vercel image transformations (5K/mo)** — but only
  for drafts of a *set not drafted in the last 31 days* (~500–800
  transformations per cold set), i.e. ~6–10 *new-set* drafts/month. Repeat
  drafts of the same set are nearly free thanks to the 31-day image cache.
  Exceeding the cap does not cost money: new images fail with a 402 and render
  as alt text (visibly broken cards) until the month resets.
- Everything else (function invocations, bandwidth, Realtime messages, Upstash,
  Blob, MAU, DB storage) has 100x+ headroom.

## 1. Free-tier allotments (verified 2026-07-21)

### Vercel Hobby

| Resource | Included / month |
|---|---|
| Image transformations | 5,000 |
| Image cache reads | 300K (8 KB units) |
| Image cache writes | 100K (8 KB units) |
| Fast data transfer (bandwidth) | 100 GB |
| Function invocations | 1M |
| Edge requests | 1M |
| Compute | 4 CPU-hours |
| Blob | 5 GB storage, 100K simple ops, 10K advanced ops, 100 GB transfer |

Over-limit behavior: no charges ever on Hobby. Image optimization returns 402
(alt text shown); Blob access is cut off for 30 days; deployments can pause.
Note: Hobby is restricted to **non-commercial personal use**.

### Supabase Free

| Resource | Included |
|---|---|
| Database egress | 5 GB/mo |
| Cached egress | 5 GB/mo |
| Database size | 500 MB |
| Realtime messages | 2M/mo |
| Realtime peak connections | 200 |
| Monthly active users | 50,000 |
| Edge function invocations | 500K/mo |

Also: projects pause after 7 days of inactivity; no backups (we run our own via
`npm run backup-prod`).

### Upstash Redis Free

500K commands/mo, 10 GB bandwidth, 256 MB storage.

### Scryfall

No metered quota. API rate limit ~10 req/s (client already throttles at 75 ms
intervals). Image CDN (`cards.scryfall.io`) is only hit by Vercel on image
transformation cache misses, not by end users.

### Current actual usage

Usage meters are not exposed via CLI/MCP — check dashboards:
- Vercel: Dashboard → Usage (also Observability → Blob)
- Supabase: Dashboard → Project → Reports → Usage

Pulled via SQL on prod (2026-07-21): **database size 40 MB / 500 MB**, 5 draft
rows, 222 kB total stored state (TOAST-compressed; serialized JSON per active
draft is 125–180 KB).

## 2. Per-draft consumption model — 6-player full draft

Assumptions: 6 human players, 3 packs × 15 cards = 18 packs, **270 total
picks**, ~50 min duration, phones (DPR 2–3), each player cumulatively spends
~30 min on the "waiting for next pack" screen.

### Refresh traffic (the dominant term)

Two triggers call `router.refresh()`, which re-runs `pick/page.tsx` on the
server:

1. **Realtime**: every draft-row change notifies all 6 subscribed clients →
   270 picks × 6 = **1,620 refreshes**
2. **Polling fallback** (`PickClient.tsx`): while a player has no pack, the
   client refreshes on `WAITING_POLL_INTERVAL_MS` → ~30 min waiting × 6 players
   = **5,400 refreshes at the old 2s**, **~1,350 at today's 8s**

Total ≈ **7,000 refreshes per draft before podman-12, ≈2,970 after**. Each is:
1 Vercel function invocation + 1 Supabase read + a ~20–50 KB RSC payload to the
client.

The Supabase read used to be `select("id, status, state, config")` — the whole
~125–180 KB state JSON, including five other players' packs and pools. It is
now the `get_draft_pick_view` RPC, which returns only the caller's seat plus
per-seat counts. Measured on a real draft (§5): **7.4 KB at the first pick,
19.8 KB at the last, ~13.6 KB mean**, against a state that ran 48 KB → 326 KB
over the same draft.

| Meter | Per draft (before) | Per draft (after) | Notes |
|---|---|---|---|
| Supabase DB egress | **0.26–1.3 GB** | **~8–40 MB** | before: 7,000 × ~187 KB mean; after: 2,970 × ~13.6 KB. Lower end of each assumes ~5x gzip on the wire |
| Vercel function invocations | ~7,300 | ~3,300 | refreshes + 270 pick actions + misc |
| Vercel fast data transfer | ~0.3 GB | ~0.15 GB | RSC payloads (~210 MB before, ~90 MB after) + card images to 6 browsers (~65 MB) |
| Supabase Realtime messages | ~2,000 | ~2,000 | 270 changes × 6 subscribers + presence — unaffected |
| Realtime peak connections | 6 | 6 | vs 200 |
| Upstash commands | < 100 | < 100 | booster-data cache reads/warmups |

### Card images

270 cards, two source URLs each (Scryfall `small` for the grid at `33vw`,
`normal` for carousel `72vw` / preview `400px`). `next.config.ts` already
restricts widths to 6 (`[640, 828, 1080]` + `[128, 256, 384]`), serves
WebP-only, and caches transformations 31 days.

- **First draft of a set (cold cache)**: ~1–2 widths of `normal` + 1 width of
  `small` per card ≈ **500–800 transformations** (and a similar number of cache
  writes, ~5 units each — well under the write cap)
- **Repeat drafts of the same set within 31 days**: ~0 transformations; served
  from the image cache (reads: ~8K units/draft vs 300K cap)
- Browsers cache images locally, so each player downloads each image once

## 3. Headroom — drafts per month

| Quota | Cap | Per draft | Drafts/month (before) | Drafts/month (after) |
|---|---|---|---|---|
| **Image transformations** | 5K | 500–800 (cold set only) | ~6–10 *new-set* drafts | **~6–10 *new-set* drafts** ← now first to exhaust; repeats ≈ free |
| Supabase DB egress | 5 GB | 8–40 MB (was 0.26–1.3 GB) | ~4–19 | ~125–625 |
| Function invocations | 1M | ~3.3K (was ~7.3K) | ~135 | ~300 |
| Fast data transfer | 100 GB | ~0.15 GB (was ~0.3 GB) | ~300 | ~650 |
| Realtime messages | 2M | ~2K | ~1,000 | ~1,000 |
| Upstash commands | 500K | <100 | ~5,000+ | ~5,000+ |
| DB storage | 500 MB | ~0.2 MB stored | not a constraint (40 MB used) | same |

Crack-a-Pack is comparatively cheap (one pack generation + ~15–30 images, no
polling loop) — dozens of packs ≈ one draft's worth of image usage, negligible
egress.

## 4. Mitigations (ordered by impact)

1. ~~**Lengthen the polling fallback**~~ — **done (podman-12)**. The waiting
   screen polls on `WAITING_POLL_INTERVAL_MS` (8s, `src/lib/draft-view.ts`),
   not 2s. Realtime is the primary signal; the poll only covers dropped
   subscriptions. 4x fewer refreshes.
2. ~~**Stop refetching the full state per refresh**~~ (April audit §5.2) —
   **done (podman-12)**. `pick/page.tsx` calls `get_draft_pick_view` instead of
   `select("id, status, state, config")`. The RPC returns the caller's seat
   (current pack, pool, deck/sideboard as keys into the pool) plus per-seat
   counts for the pod list — measured 6.6x smaller at the first pick of a real
   draft, 16.5x at the last (§5).
3. **Verify wire compression**: confirm PostgREST responses are gzip-encoded
   for the server client. If not, enabling it is a free ~5x egress cut.
   Still unverified — it's the difference between the two ends of the egress
   range in §3.
4. **Images are the remaining constraint** and are already mitigated (31-day TTL, WebP-only, 6 widths — PR #26).
   Optional extras: lower `quality` on carousel images; when possible, draft
   sets already drafted that month. Watch for the 402/alt-text failure mode —
   it's the visible symptom of hitting the transformation cap.
5. **If usage outgrows free tier**: Vercel Pro fixes image transformations (the
   current binding constraint); Supabase Pro ($25/mo, 250 GB egress) is no
   longer needed for egress. Neither is needed at current scale (~a few
   drafts/month).

## 5. Re-measurement after podman-12

**Method.** A full 8-player simulated draft (1 human + 7 bots, 40 picks each)
was run on the PR preview against staging, and both payloads were measured
directly on the live row at each end of the draft — `length(state::text)` (what
the old `select` returned) vs `length(get_draft_pick_view(id)::text)`, with
`request.jwt.claims` set to the human seat's user id:

| Point in draft | Full `drafts.state` | RPC payload | Ratio |
|---|---|---|---|
| Pack 1, pick 1 | 48,372 B | 7,367 B | 6.6x |
| End of pack 3 | 326,064 B | 19,783 B | **16.5x** |
| Draft mean (linear) | ~187 KB | ~13.6 KB | **~13.7x** |

The ratio climbs through the draft because `state` grows by *every* seat's pool
while the viewer's payload grows by only their own — so the saving is largest
exactly when refresh traffic has been accumulating longest.

Applying the ~13.6 KB mean to the 6-player refresh model: **7,000 × ~187 KB ≈
1.3 GB before → 2,970 × ~13.6 KB ≈ 40 MB after**, a **~32x per-draft egress
cut** (or ~0.26 GB → ~8 MB if PostgREST gzips the wire).

`scripts/measure-pick-view-payload.sql` reproduces the same comparison offline
against a synthetic 6-seat fixture (187,078 B → 15,902 B, 11.8x — consistent
with the live mean) on a throwaway Postgres container, and asserts the access
rule: a caller with no seat gets back `{"seat": null, "status": ...,
"podMembers": []}` — no roster, no cards.

**Not measured:** the Supabase dashboard's own egress meter. It reports
cumulative bytes per billing cycle at daily granularity and refreshes on a lag,
so a single ~40 MB draft is not reliably distinguishable from noise there. The
direct payload measurement above is the same quantity, sourced per request
rather than inferred from a chart. The remaining modelled term is the refresh
*count* (~2,970), which comes from the §2 assumptions, not from measurement.

## Sources

- [Vercel Image Optimization limits & pricing](https://vercel.com/docs/image-optimization/limits-and-pricing)
- [Vercel Blob usage & pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)
- [Vercel Hobby limits overview](https://www.promptstoproduct.com/vercel-free-tier-limits) / [Vercel changelog: Hobby image limits](https://vercel.com/changelog/increased-hobby-usage-limits-for-image-optimization)
- [Supabase pricing](https://supabase.com/pricing)
- [Upstash Redis pricing](https://upstash.com/pricing/redis) / [Upstash pricing docs](https://upstash.com/docs/redis/overall/pricing)
