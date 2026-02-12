---
title: Supabase Database Schema Design
status: draft
last_verified: 2026-02-11
---

# Supabase Database Schema Design

## Context

podman has a complete frontend (~4,700 lines) with no backend. We're adding Supabase as the backend, starting with the database schema. The app is invite-only at launch (site admin creates invite links), with a path to open sign-up later. Full social features (groups, proposals, voting, scheduling) are included from the start. Active draft state is stored as a JSON column; completed drafts as JSON blobs with a future migration path to normalized pick data.

---

## Schema

### `profiles`

Extends Supabase Auth's `auth.users`. Created automatically via trigger on sign-up.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | References `auth.users(id)` |
| `display_name` | `text` NOT NULL | |
| `avatar_url` | `text` | |
| `is_site_admin` | `boolean` DEFAULT false | Controls invite creation, admin panel access |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

### `invites`

Site-level invites (for invite-only phase). When open sign-up is enabled later, this table becomes optional.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `code` | `text` UNIQUE NOT NULL | Short code used in invite URL |
| `created_by` | `uuid` FK → profiles | Must be site admin |
| `claimed_by` | `uuid` FK → profiles | NULL until used |
| `expires_at` | `timestamptz` | |
| `created_at` | `timestamptz` | |

### `groups`

Friend groups that organize drafts together.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `name` | `text` NOT NULL | |
| `description` | `text` | |
| `invite_code` | `text` UNIQUE NOT NULL | For joining the group |
| `created_by` | `uuid` FK → profiles | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

### `group_members`

Join table with role.

| Column | Type | Notes |
|--------|------|-------|
| `group_id` | `uuid` FK → groups | Composite PK |
| `user_id` | `uuid` FK → profiles | Composite PK |
| `role` | `text` NOT NULL | `"admin"` or `"member"` |
| `joined_at` | `timestamptz` | |

### `draft_proposals`

Proposed drafts within a group. Includes voting and scheduling.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `group_id` | `uuid` FK → groups | |
| `proposed_by` | `uuid` FK → profiles | |
| `title` | `text` NOT NULL | e.g. "FDN Draft Friday" |
| `format` | `text` NOT NULL | `"standard"`, `"winston"`, `"cube"` |
| `set_code` | `text` | NULL for cube |
| `set_name` | `text` | |
| `cube_id` | `text` | CubeCobra cube ID |
| `player_count` | `int` NOT NULL | 2-8 |
| `scheduled_at` | `timestamptz` | NULL = unscheduled |
| `status` | `text` NOT NULL DEFAULT 'open' | `"open"`, `"confirmed"`, `"cancelled"`, `"drafted"` |
| `config` | `jsonb` | Timer preset, pacing mode, deck building toggle, etc. |
| `created_at` | `timestamptz` | |

### `proposal_votes`

RSVPs / votes on draft proposals.

| Column | Type | Notes |
|--------|------|-------|
| `proposal_id` | `uuid` FK → draft_proposals | Composite PK |
| `user_id` | `uuid` FK → profiles | Composite PK |
| `vote` | `text` NOT NULL | `"in"`, `"out"`, `"maybe"` |
| `voted_at` | `timestamptz` | |

### `drafts`

Active and completed draft sessions. The core table.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `proposal_id` | `uuid` FK → draft_proposals | NULL if created without proposal |
| `group_id` | `uuid` FK → groups | |
| `host_id` | `uuid` FK → profiles | |
| `format` | `text` NOT NULL | |
| `set_code` | `text` | |
| `set_name` | `text` | |
| `status` | `text` NOT NULL | `"lobby"`, `"active"`, `"deck_building"`, `"complete"` |
| `config` | `jsonb` NOT NULL | All config from the `Draft` type (timer, pacing, cards per pack, etc.) |
| `state` | `jsonb` | Live draft state — seats, packs, picks, winston state. NULL before start. |
| `result` | `jsonb` | Final snapshot on completion. Preserved even if `state` is cleared. |
| `created_at` | `timestamptz` | |
| `started_at` | `timestamptz` | |
| `completed_at` | `timestamptz` | |

> [!IMPORTANT]
> **`state` vs `result`**:
> - `state` holds the live `Draft` object (serialized from the engine) during active play
> - On completion, `state` is copied to `result` and `state` is NULLed
> - `result` is the blob for history viewing (future: normalize picks out of it)

### `draft_players`

Players in a specific draft. Separate from group membership since not all group members join every draft.

| Column | Type | Notes |
|--------|------|-------|
| `draft_id` | `uuid` FK → drafts | Composite PK |
| `user_id` | `uuid` FK → profiles | Composite PK |
| `seat_position` | `int` | 0-7, assigned at draft start |
| `joined_at` | `timestamptz` | |

### Future: `draft_picks` (not built now)

When we normalize pick history, each row would be:

| Column | Type | Notes |
|--------|------|-------|
| `draft_id` | `uuid` FK → drafts | |
| `user_id` | `uuid` FK → profiles | |
| `pick_number` | `int` | Overall pick (1-42+) |
| `pack_number` | `int` | 1, 2, or 3 |
| `pick_in_pack` | `int` | 1-14 |
| `card_scryfall_id` | `text` | |
| `card_name` | `text` | |

> [!WARNING]
> This table is **NOT** created now — documented here so the schema is designed with this migration in mind. The `result` JSON preserves all pick data needed to backfill this table later.

---

## Indexes

| Index | Purpose |
|-------|---------|
| `invites(code)` UNIQUE | Lookup by invite code |
| `groups(invite_code)` UNIQUE | Lookup by group invite |
| `group_members(user_id)` | Find all groups for a user |
| `draft_proposals(group_id, status)` | List open proposals per group |
| `drafts(group_id, status)` | List active/recent drafts per group |
| `drafts(status)` | Find all active drafts (cleanup/monitoring) |
| `draft_players(user_id)` | Find all drafts for a user |

---

## Row-Level Security (RLS)

| Table | Policy |
|-------|--------|
| `profiles` | Users can read all profiles; update only their own |
| `invites` | Site admins can create; anyone with the code can claim |
| `groups` | Members can read; admins can update |
| `group_members` | Members can read group roster; admins can manage |
| `draft_proposals` | Group members can read/create; proposer or admin can update |
| `proposal_votes` | Group members can vote; own votes only |
| `drafts` | Draft players can read; host can update config; state updates via server |
| `draft_players` | Draft players can read; host manages roster |

> [!CAUTION]
> Draft `state` updates during live play should go through a Supabase Edge Function (server-side) to prevent clients from tampering with game state. Clients send actions (e.g. "pick card X"), the function validates and applies them via the draft engine.

---

## Bootstrap Flow

1. On first deploy, a seed script creates:
   - A single `profiles` row with `is_site_admin = true` for the owner
   - An initial invite code
2. Owner shares invite links with friends
3. Friends sign up → claim invite → join groups → propose drafts

---

## Entity Relationship Diagram

```
auth.users ──1:1──→ profiles
                      │
          ┌───────────┼───────────────┐
          ↓           ↓               ↓
       invites     group_members   draft_players
                      │               │
                      ↓               ↓
                   groups          drafts ←── draft_proposals
                      │               │            │
                      └───────────────┘     proposal_votes
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/001_initial_schema.sql` | All tables, indexes, RLS policies |
| `supabase/seed.sql` | Bootstrap site admin + first invite |
| `src/lib/supabase.ts` | Supabase client initialization (browser + server) |
| `src/lib/database.types.ts` | Generated types from Supabase CLI |

---

## Verification Plan

### Automated
- `supabase init` and `supabase start` (local dev)
- Run migration, verify tables exist via Supabase Studio
- Run seed, verify admin profile and invite created
- `supabase gen types typescript` to generate `database.types.ts`

### Manual
- Verify generated types align with existing `types.ts` models
- Test RLS policies by querying as different user roles

---

**End of Schema Design**
