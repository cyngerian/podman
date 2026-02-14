/**
 * Load booster distribution data from Supabase.
 * Queries the 5 booster tables (products, configs, config_slots, sheets, sheet_cards)
 * and returns structured data for pack generation.
 */

import { createAdminClient } from "./supabase-admin";

// --- Types ---

export interface SheetCard {
  set_code: string;
  collector_number: string;
  weight: number;
  is_foil: boolean;
}

export interface BoosterSheet {
  id: number;
  name: string;
  total_weight: number;
  cards: SheetCard[];
}

export interface ConfigSlot {
  sheet_id: number;
  count: number;
}

export interface BoosterConfig {
  id: number;
  weight: number;
  slots: ConfigSlot[];
}

export interface BoosterProductData {
  productId: number;
  code: string;
  setCode: string;
  configs: BoosterConfig[];
  sheets: Map<number, BoosterSheet>;
  allCardIdentifiers: Array<{ set: string; collector_number: string }>;
}

/**
 * Load booster product data for a set code.
 * Tries product codes in order: {set}-play, {set}-draft, {set}
 * Returns null if no product found (triggers fallback to template system).
 */
export async function loadBoosterProductData(
  setCode: string
): Promise<BoosterProductData | null> {
  const supabase = createAdminClient();
  const code = setCode.toLowerCase();

  // Try product codes in preference order
  const candidates = [`${code}-play`, `${code}-draft`, code];

  let product: { id: number; code: string; set_code: string } | null = null;
  for (const candidate of candidates) {
    const { data } = await supabase
      .from("booster_products")
      .select("id, code, set_code")
      .eq("code", candidate)
      .single();

    if (data) {
      product = data;
      break;
    }
  }

  if (!product) return null;

  // Parallel fetch: configs + sheets
  const [configsResult, sheetsResult] = await Promise.all([
    supabase
      .from("booster_configs")
      .select("id, weight")
      .eq("product_id", product.id),
    supabase
      .from("booster_sheets")
      .select("id, name, total_weight")
      .eq("product_id", product.id),
  ]);

  const configs = configsResult.data ?? [];
  const sheets = sheetsResult.data ?? [];

  if (configs.length === 0 || sheets.length === 0) return null;

  const configIds = configs.map((c) => c.id);
  const sheetIds = sheets.map((s) => s.id);

  // Fetch config_slots + sheet_cards per-sheet in parallel.
  // Sheet cards are fetched per-sheet to avoid PostgREST's server-side
  // max-rows cap (1000). A single bulk query with .limit(5000) gets silently
  // truncated for products with >1000 total sheet_cards (44 products affected).
  const [slotsResult, ...sheetCardsResults] = await Promise.all([
    supabase
      .from("booster_config_slots")
      .select("config_id, sheet_id, count")
      .in("config_id", configIds),
    ...sheetIds.map((sheetId) =>
      supabase
        .from("sheet_cards")
        .select("sheet_id, set_code, collector_number, weight, is_foil")
        .eq("sheet_id", sheetId)
    ),
  ]);

  const slots = slotsResult.data ?? [];
  const cards = sheetCardsResults.flatMap((r) => r.data ?? []);

  // Build sheet map
  const sheetMap = new Map<number, BoosterSheet>();
  for (const sheet of sheets) {
    sheetMap.set(sheet.id, {
      id: sheet.id,
      name: sheet.name,
      total_weight: Number(sheet.total_weight),
      cards: [],
    });
  }

  // Populate sheet cards
  const identifierSet = new Map<string, { set: string; collector_number: string }>();
  for (const card of cards) {
    const sheet = sheetMap.get(card.sheet_id);
    if (sheet) {
      sheet.cards.push({
        set_code: card.set_code,
        collector_number: card.collector_number,
        weight: Number(card.weight),
        is_foil: card.is_foil,
      });
      const key = `${card.set_code}:${card.collector_number}`;
      if (!identifierSet.has(key)) {
        identifierSet.set(key, {
          set: card.set_code,
          collector_number: card.collector_number,
        });
      }
    }
  }

  // Build config objects with slots
  const slotsByConfig = new Map<number, ConfigSlot[]>();
  for (const slot of slots) {
    const existing = slotsByConfig.get(slot.config_id) ?? [];
    existing.push({ sheet_id: slot.sheet_id, count: slot.count });
    slotsByConfig.set(slot.config_id, existing);
  }

  const boosterConfigs: BoosterConfig[] = configs.map((c) => ({
    id: c.id,
    weight: c.weight,
    slots: slotsByConfig.get(c.id) ?? [],
  }));

  return {
    productId: product.id,
    code: product.code,
    setCode: product.set_code,
    configs: boosterConfigs,
    sheets: sheetMap,
    allCardIdentifiers: Array.from(identifierSet.values()),
  };
}
