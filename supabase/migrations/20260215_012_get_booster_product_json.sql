-- Postgres function to load all booster product data in a single query.
-- Collapses 5 tables (products, configs, config_slots, sheets, sheet_cards)
-- into one JSONB response for efficient caching.

CREATE OR REPLACE FUNCTION public.get_booster_product_json(p_code text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'productId', p.id,
    'code', p.code,
    'setCode', p.set_code,
    'configs', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'weight', c.weight,
          'slots', (
            SELECT COALESCE(jsonb_agg(
              jsonb_build_object(
                'sheet_id', cs.sheet_id,
                'count', cs.count
              )
            ), '[]'::jsonb)
            FROM public.booster_config_slots cs
            WHERE cs.config_id = c.id
          )
        )
      ), '[]'::jsonb)
      FROM public.booster_configs c
      WHERE c.product_id = p.id
    ),
    'sheets', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'total_weight', s.total_weight,
          'cards', (
            SELECT COALESCE(jsonb_agg(
              jsonb_build_object(
                'set_code', sc.set_code,
                'collector_number', sc.collector_number,
                'weight', sc.weight,
                'is_foil', sc.is_foil
              )
            ), '[]'::jsonb)
            FROM public.sheet_cards sc
            WHERE sc.sheet_id = s.id
          )
        )
      ), '[]'::jsonb)
      FROM public.booster_sheets s
      WHERE s.product_id = p.id
    )
  )
  FROM public.booster_products p
  WHERE p.code = p_code;
$$;
