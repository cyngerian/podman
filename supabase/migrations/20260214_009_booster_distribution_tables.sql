-- Booster distribution data tables
-- Models the taw/magic-sealed-data format for accurate pack generation.
-- Five tables: booster_products → booster_configs → booster_config_slots,
--              booster_sheets → sheet_cards
-- All use serial integer PKs (internal reference data, not user-facing).

-- 1. booster_products: one per set's booster type (~300 rows)
CREATE TABLE public.booster_products (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,         -- e.g. "mkm" or "mkm-collector"
  set_code text NOT NULL,            -- e.g. "mkm"
  set_name text NOT NULL,
  name text NOT NULL,                -- e.g. "Murders at Karlov Manor Play Booster"
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. booster_configs: weighted pack configurations per product (~1,500 rows)
CREATE TABLE public.booster_configs (
  id serial PRIMARY KEY,
  product_id integer NOT NULL REFERENCES public.booster_products(id) ON DELETE CASCADE,
  weight integer NOT NULL DEFAULT 1  -- relative probability of this config
);

-- 3. booster_config_slots: how many cards from each sheet per config (~15,000 rows)
CREATE TABLE public.booster_config_slots (
  id serial PRIMARY KEY,
  config_id integer NOT NULL REFERENCES public.booster_configs(id) ON DELETE CASCADE,
  sheet_id integer NOT NULL,         -- FK added after booster_sheets is created
  count integer NOT NULL DEFAULT 1   -- number of cards drawn from this sheet
);

-- 4. booster_sheets: named card groups per product (~6,000 rows)
CREATE TABLE public.booster_sheets (
  id serial PRIMARY KEY,
  product_id integer NOT NULL REFERENCES public.booster_products(id) ON DELETE CASCADE,
  name text NOT NULL,                -- e.g. "common", "rare_mythic", "foil_common"
  total_weight bigint NOT NULL,       -- sum of all card weights in this sheet
  UNIQUE (product_id, name)
);

-- Now add the FK from booster_config_slots to booster_sheets
ALTER TABLE public.booster_config_slots
  ADD CONSTRAINT booster_config_slots_sheet_id_fkey
  FOREIGN KEY (sheet_id) REFERENCES public.booster_sheets(id) ON DELETE CASCADE;

-- 5. sheet_cards: individual cards per sheet (~300,000 rows)
CREATE TABLE public.sheet_cards (
  id serial PRIMARY KEY,
  sheet_id integer NOT NULL REFERENCES public.booster_sheets(id) ON DELETE CASCADE,
  set_code text NOT NULL,            -- e.g. "mkm"
  collector_number text NOT NULL,    -- e.g. "42", "42a"
  weight bigint NOT NULL DEFAULT 1,   -- relative weight within the sheet
  is_foil boolean NOT NULL DEFAULT false
);

-- Index for looking up cards by set+number (used to bridge to Scryfall IDs)
CREATE INDEX idx_sheet_cards_set_number ON public.sheet_cards (set_code, collector_number);

-- Index for loading all cards in a sheet
CREATE INDEX idx_sheet_cards_sheet_id ON public.sheet_cards (sheet_id);

-- Index for looking up sheets by product
CREATE INDEX idx_booster_sheets_product_id ON public.booster_sheets (product_id);

-- Index for looking up configs by product
CREATE INDEX idx_booster_configs_product_id ON public.booster_configs (product_id);

-- RLS: read-only for authenticated users, writes via admin client only
ALTER TABLE public.booster_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booster_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booster_config_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booster_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booster_products_select" ON public.booster_products
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "booster_configs_select" ON public.booster_configs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "booster_config_slots_select" ON public.booster_config_slots
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "booster_sheets_select" ON public.booster_sheets
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sheet_cards_select" ON public.sheet_cards
  FOR SELECT TO authenticated USING (true);
