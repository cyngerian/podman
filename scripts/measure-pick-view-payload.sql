-- Reproduces the payload measurement in docs/usage-analysis.md §5: how much
-- smaller is get_draft_pick_view's result than the full drafts.state JSON it
-- replaced? Runs against a throwaway Postgres — no Supabase project needed.
--
--   docker run -d --name pg-measure -e POSTGRES_PASSWORD=pw postgres:17-alpine
--   docker cp supabase/migrations/20260721000000_get_draft_pick_view.sql pg-measure:/tmp/mig.sql
--   docker cp scripts/measure-pick-view-payload.sql pg-measure:/tmp/measure.sql
--   docker exec pg-measure psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/measure.sql
--   docker rm -f pg-measure
--
-- The fixture is a 6-seat mid-draft: per seat a 10-card current pack, an
-- 11-card queued pack, a 20-card pool, a 14-card deck, a 6-card sideboard and
-- 20 picks, with full CardReference fields (both Scryfall image URLs).

-- Stand-ins for the Supabase pieces the RPC depends on.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth._who (uid uuid);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT uid FROM auth._who LIMIT 1 $$;

CREATE TABLE IF NOT EXISTS public.drafts (
  id uuid primary key,
  status text not null,
  state jsonb
);

DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

\i /tmp/mig.sql

CREATE OR REPLACE FUNCTION pg_temp.mkcard(i int) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'scryfallId', md5(i::text) || '-0000-0000-0000-000000000000',
    'name', 'Some Reasonably Long Card Name ' || i,
    'imageUri', 'https://cards.scryfall.io/normal/front/a/b/' || md5(i::text) || '.jpg?1700000000',
    'smallImageUri', 'https://cards.scryfall.io/small/front/a/b/' || md5(i::text) || '.jpg?1700000000',
    'rarity', 'common', 'colors', jsonb_build_array('U'), 'cmc', 3,
    'typeLine', 'Creature — Human Wizard', 'isFoil', false)
$$;

CREATE OR REPLACE FUNCTION pg_temp.mkcards(n int, off int) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(jsonb_agg(pg_temp.mkcard(g)), '[]'::jsonb) FROM generate_series(off, off+n-1) g
$$;

INSERT INTO auth._who VALUES ('aaaaaaaa-0000-0000-0000-000000000001');

INSERT INTO public.drafts (id, status, state)
SELECT '99999999-9999-9999-9999-999999999999', 'active',
  jsonb_build_object(
    'setCode','fin','setName','Final Fantasy','startedAt',1700000000000,
    'currentPack',2,'cardsPerPack',14,'timerPreset','relaxed','pacingMode','realtime',
    'seats', (SELECT jsonb_agg(jsonb_build_object(
      'position', seat,
      'userId', CASE WHEN seat = 0 THEN 'aaaaaaaa-0000-0000-0000-000000000001'
                     ELSE 'user-' || seat END,
      'displayName', 'Player ' || seat,
      'currentPack', jsonb_build_object('id','p'||seat,'originSeat',seat,'round',2,'pickNumber',5,
        'cards', pg_temp.mkcards(10, seat*1000)),
      'packQueue', jsonb_build_array(jsonb_build_object('id','q'||seat,'originSeat',seat,
        'round',2,'pickNumber',4,'cards', pg_temp.mkcards(11, seat*1000+100))),
      'picks', (SELECT jsonb_agg(jsonb_build_object('pickNumber',g,'packNumber',2,'pickInPack',g,
                  'cardId', md5(g::text), 'cardName','Some Reasonably Long Card Name '||g,
                  'timestamp',1700000000000)) FROM generate_series(1,20) g),
      'pool', pg_temp.mkcards(20, seat*1000+200),
      'deck', pg_temp.mkcards(14, seat*1000+200),
      'sideboard', pg_temp.mkcards(6, seat*1000+214),
      'basicLands', jsonb_build_object('W',0,'U',9,'B',8,'R',0,'G',0),
      'queuedCardId', null, 'hasSubmittedDeck', false,
      'packReceivedAt', 1700000001000))
      FROM generate_series(0,5) seat)
  );

\echo '--- payload sizes (bytes) ---'
SELECT
  length(state::text) AS full_state_bytes,
  length(public.get_draft_pick_view('99999999-9999-9999-9999-999999999999')::text) AS narrow_bytes,
  round(length(state::text)::numeric
        / length(public.get_draft_pick_view('99999999-9999-9999-9999-999999999999')::text), 1) AS reduction_x
FROM public.drafts WHERE id = '99999999-9999-9999-9999-999999999999';

\echo '--- a non-participant gets no roster and no cards ---'
UPDATE auth._who SET uid = 'bbbbbbbb-0000-0000-0000-000000000009';
SELECT public.get_draft_pick_view('99999999-9999-9999-9999-999999999999') AS non_participant;
