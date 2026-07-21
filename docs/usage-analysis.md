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
  (realtime + the 2-second polling fallback), each pulling the ~125–180 KB
  `drafts.state` JSON — **0.2–1.0 GB per draft → roughly 5–25 drafts/month**.
  After podman-12 it's ~2,970 refetches × ~15–25 KB → **~15–60 MB per draft →
  roughly 80–400 drafts/month** (~20x better; see §5).
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
per-seat counts: **~16 KB** on a measured 6-seat mid-draft fixture whose full
state was 187 KB (~12x smaller; ~25 KB late in a draft as the pool grows).

| Meter | Per draft (before) | Per draft (after) | Notes |
|---|---|---|---|
| Supabase DB egress | **0.2–1.0 GB** | **~15–60 MB** | before: 7,000 × 150 KB; after: 2,970 × ~20 KB. Lower end of each assumes ~5x gzip on the wire |
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
| Supabase DB egress | 5 GB | 15–60 MB (was 0.2–1 GB) | ~5–25 | ~80–400 |
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
   counts for the pod list — measured ~16 KB against a 187 KB full state.
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

**Method.** `scripts/measure-pick-view-payload.sql` (run instructions in its
header) applies the migration to a throwaway Postgres 17 container and measures
the RPC against a synthetic but realistic 6-seat mid-draft state — each seat a
10-card current pack, 11-card queued pack, 20-card pool, 14-card deck, 6-card
sideboard and 20 picks, with full `CardReference` fields including both
Scryfall image URLs:

| | Bytes |
|---|---|
| Full `drafts.state` (what the old `select` returned) | 187,078 |
| `get_draft_pick_view` payload | 15,902 |
| **Ratio** | **11.8x** |

Combined with 7,000 → ~2,970 refreshes, that models a **~20x per-draft egress
cut** (~1 GB → ~50 MB uncompressed).

The same script asserts the access rule: a caller with no seat in the draft gets
back `{"seat": null, "status": ..., "podMembers": []}` — no roster, no cards.

**Still to confirm on real traffic:** the numbers above are payload-size
measurements plus the refresh-count model, not dashboard readings. Supabase
does not expose usage via CLI or MCP, so the before/after dashboard comparison
(Dashboard → Project → Reports → Usage, around a full test draft) has to be
read by hand once a real draft has run on the new code. Update the §3 table if
it diverges.

## Sources

- [Vercel Image Optimization limits & pricing](https://vercel.com/docs/image-optimization/limits-and-pricing)
- [Vercel Blob usage & pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)
- [Vercel Hobby limits overview](https://www.promptstoproduct.com/vercel-free-tier-limits) / [Vercel changelog: Hobby image limits](https://vercel.com/changelog/increased-hobby-usage-limits-for-image-optimization)
- [Supabase pricing](https://supabase.com/pricing)
- [Upstash Redis pricing](https://upstash.com/pricing/redis) / [Upstash pricing docs](https://upstash.com/docs/redis/overall/pricing)
