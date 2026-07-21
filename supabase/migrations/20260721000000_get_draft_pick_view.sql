-- Narrow read path for the pick screen (task podman-12).
--
-- `pick/page.tsx` used to `select("id, status, state, config")`, pulling the
-- whole ~125-180 KB `drafts.state` JSON on every `router.refresh()` — and a
-- 6-player draft triggers roughly 7,000 of those (realtime + polling
-- fallback). That made Supabase DB egress the binding free-tier constraint.
--
-- This RPC returns only the slice the viewer can actually see:
--   * a handful of scalar draft config fields
--   * the caller's own seat (current pack, pool, deck/sideboard as card keys,
--     queue length) — never another player's pack or pool
--   * per-seat counts for the pod status list
--
-- Deck and sideboard come back as *keys into the pool* ("<scryfallId>:<isFoil>")
-- rather than full card objects, since every deck/sideboard card is also a pool
-- card; the server re-expands them (see src/lib/draft-view.ts).
--
-- Authorization: SECURITY DEFINER (bypasses RLS), so the function does the
-- gating itself — a caller with no seat matching auth.uid() gets only the
-- draft's status back, no roster and no cards. That keeps it no more
-- permissive than the `drafts_select` RLS policy it replaces.

-- Compact "<scryfallId>:<isFoil>" keys for a jsonb array of CardReferences.
-- Returns SQL NULL when the input is absent/JSON-null (an unbuilt deck), which
-- the caller distinguishes from an empty deck.
CREATE OR REPLACE FUNCTION public.draft_card_keys(p_cards jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN jsonb_typeof(p_cards) IS DISTINCT FROM 'array' THEN NULL ELSE (
    SELECT COALESCE(jsonb_agg(
      COALESCE(c->>'scryfallId', '') || ':' || COALESCE(c->>'isFoil', 'false')
    ), '[]'::jsonb)
    FROM jsonb_array_elements(p_cards) AS t(c)
  ) END;
$$;

CREATE OR REPLACE FUNCTION public.get_draft_pick_view(p_draft_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- No seat for the caller => no draft data at all. The pick page redirects on
  -- a null seat anyway, and returning the roster here would hand any
  -- authenticated user with a draft UUID the pod's user ids and display names,
  -- which the drafts_select RLS policy does not allow.
  SELECT CASE WHEN me.seat IS NULL THEN jsonb_build_object(
    'status', d.status,
    'seat', NULL,
    'podMembers', '[]'::jsonb
  ) ELSE jsonb_build_object(
    'status', d.status,
    'setCode', d.state->'setCode',
    'setName', d.state->'setName',
    'startedAt', d.state->'startedAt',
    'currentPack', d.state->'currentPack',
    'cardsPerPack', d.state->'cardsPerPack',
    'timerPreset', d.state->'timerPreset',
    'pacingMode', d.state->'pacingMode',
    'seat', jsonb_build_object(
      'position', me.seat->'position',
      'currentPack', CASE
        WHEN jsonb_typeof(me.seat->'currentPack') IS DISTINCT FROM 'object' THEN NULL
        ELSE jsonb_build_object(
          'round', me.seat->'currentPack'->'round',
          'pickNumber', me.seat->'currentPack'->'pickNumber',
          'cards', CASE
            WHEN jsonb_typeof(me.seat->'currentPack'->'cards') = 'array'
            THEN me.seat->'currentPack'->'cards'
            ELSE '[]'::jsonb
          END
        )
      END,
      'pool', CASE
        WHEN jsonb_typeof(me.seat->'pool') = 'array' THEN me.seat->'pool'
        ELSE '[]'::jsonb
      END,
      'deckKeys', public.draft_card_keys(me.seat->'deck'),
      'sideboardKeys', public.draft_card_keys(me.seat->'sideboard'),
      'packQueueLength', CASE
        WHEN jsonb_typeof(me.seat->'packQueue') = 'array'
        THEN jsonb_array_length(me.seat->'packQueue')
        ELSE 0
      END,
      'packReceivedAt', me.seat->'packReceivedAt'
    ),
    'podMembers', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'position', s->'position',
          'userId', s->>'userId',
          'displayName', s->>'displayName',
          'pickCount', CASE
            WHEN jsonb_typeof(s->'picks') = 'array' THEN jsonb_array_length(s->'picks')
            ELSE 0
          END,
          'isCurrentlyPicking', COALESCE(jsonb_typeof(s->'currentPack') = 'object', false),
          'queuedPacks', CASE
            WHEN jsonb_typeof(s->'packQueue') = 'array' THEN jsonb_array_length(s->'packQueue')
            ELSE 0
          END
        )
        ORDER BY (s->>'position')::int
      ), '[]'::jsonb)
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(d.state->'seats') = 'array'
             THEN d.state->'seats' ELSE '[]'::jsonb END
      ) AS t(s)
    )
  ) END
  FROM public.drafts d
  LEFT JOIN LATERAL (
    SELECT s AS seat
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(d.state->'seats') = 'array'
           THEN d.state->'seats' ELSE '[]'::jsonb END
    ) AS t(s)
    WHERE s->>'userId' = (SELECT auth.uid())::text
    LIMIT 1
  ) me ON true
  WHERE d.id = p_draft_id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_draft_pick_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_draft_pick_view(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.draft_card_keys(jsonb) FROM PUBLIC, anon, authenticated;
