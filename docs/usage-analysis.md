# Usage Analysis — Free-Tier Allotments & Per-Draft Consumption

<!-- last_updated: 2026-07-21 -->

Answers: how much of each free-tier quota does one full 6-player draft consume,
how many drafts/month fit, and which quota runs out first.

## TL;DR

- **Binding constraint: Supabase database egress (5 GB/mo).** A 6-player draft
  triggers ~7,000 full-state refetches (realtime + the 2-second polling
  fallback), each pulling the ~125–180 KB `drafts.state` JSON. Estimated
  **0.2–1.0 GB egress per draft → roughly 5–25 drafts/month** depending on
  wire compression.
- **Second constraint: Vercel image transformations (5K/mo)** — but only for
  drafts of a *set not drafted in the last 31 days* (~500–800 transformations
  per cold set). Repeat drafts of the same set are nearly free thanks to the
  31-day image cache. Exceeding the cap does not cost money: new images fail
  with a 402 and render as alt text (visibly broken cards) until the month
  resets.
- Everything else (function invocations, bandwidth, Realtime messages, Upstash,
  Blob, MAU, DB storage) has 100x+ headroom.
- The known fix for the binding constraint is already on the radar: April audit
  §5.2 (don't refetch the full state on every change) plus lengthening the 2s
  polling fallback. Together they cut per-draft egress by ~50–100x.

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
server — and that page selects `drafts.state` in full (~125–180 KB raw JSON):

1. **Realtime**: every draft-row change notifies all 6 subscribed clients →
   270 picks × 6 = **1,620 refreshes**
2. **Polling fallback** (`PickClient.tsx`): while a player has no pack, the
   client refreshes **every 2 seconds** → ~30 min waiting × 30 polls/min ×
   6 players ≈ **5,400 refreshes**

Total ≈ **7,000 refreshes per draft**. Each is: 1 Vercel function invocation +
1 Supabase query returning the full state + a ~20–50 KB RSC payload to the
client.

| Meter | Per draft | Notes |
|---|---|---|
| Supabase DB egress | **0.2–1.0 GB** | 7,000 × 150 KB raw ≈ 1 GB; if PostgREST gzips the wire (~5x) ≈ 0.2 GB |
| Vercel function invocations | ~7,300 | 7,000 refreshes + 270 pick actions + misc |
| Vercel fast data transfer | ~0.3 GB | RSC payloads (~210 MB) + card images to 6 browsers (~65 MB) |
| Supabase Realtime messages | ~2,000 | 270 changes × 6 subscribers + presence |
| Realtime peak connections | 6 | vs 200 |
| Upstash commands | < 100 | booster-data cache reads/warmups |

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

| Quota | Cap | Per draft | Drafts/month |
|---|---|---|---|
| **Supabase DB egress** | 5 GB | 0.2–1 GB | **~5–25** ← first to exhaust |
| Image transformations | 5K | 500–800 (cold set only) | ~6–10 *new-set* drafts; repeats ≈ free |
| Function invocations | 1M | ~7.3K | ~135 |
| Fast data transfer | 100 GB | ~0.3 GB | ~300 |
| Realtime messages | 2M | ~2K | ~1,000 |
| Upstash commands | 500K | <100 | ~5,000+ |
| DB storage | 500 MB | ~0.2 MB stored | not a constraint (40 MB used) |

Crack-a-Pack is comparatively cheap (one pack generation + ~15–30 images, no
polling loop) — dozens of packs ≈ one draft's worth of image usage, negligible
egress.

## 4. Mitigations (ordered by impact)

1. **Lengthen the polling fallback** (`PickClient.tsx`, 2s → 8–10s). Realtime
   is the primary signal; the poll is only a gap-filler. ~4–5x fewer refreshes
   for one line of code.
2. **Stop refetching the full state per refresh** (April audit §5.2, parked).
   Replace the pick page's `select("id, status, state, config")` re-render
   with a narrow RPC returning just the viewer's current pack + counts
   (~5–10 KB vs ~150 KB). Combined with (1), per-draft egress drops ~50–100x
   and Supabase stops being the binding constraint entirely.
3. **Verify wire compression**: confirm PostgREST responses are gzip-encoded
   for the server client. If not, enabling it is a free ~5x egress cut.
4. **Images are already mitigated** (31-day TTL, WebP-only, 6 widths — PR #26).
   Optional extras: lower `quality` on carousel images; when possible, draft
   sets already drafted that month. Watch for the 402/alt-text failure mode —
   it's the visible symptom of hitting the transformation cap.
5. **If usage outgrows free tier**: Supabase Pro ($25/mo, 250 GB egress) fixes
   the binding constraint; Vercel Pro fixes image transformations. Neither is
   needed at current scale (~a few drafts/month).

## Sources

- [Vercel Image Optimization limits & pricing](https://vercel.com/docs/image-optimization/limits-and-pricing)
- [Vercel Blob usage & pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)
- [Vercel Hobby limits overview](https://www.promptstoproduct.com/vercel-free-tier-limits) / [Vercel changelog: Hobby image limits](https://vercel.com/changelog/increased-hobby-usage-limits-for-image-optimization)
- [Supabase pricing](https://supabase.com/pricing)
- [Upstash Redis pricing](https://upstash.com/pricing/redis) / [Upstash pricing docs](https://upstash.com/docs/redis/overall/pricing)
