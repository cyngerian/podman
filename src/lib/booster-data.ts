/**
 * Load booster distribution data with a three-layer cache:
 *   L1: Module-level Map (per-instance, ~0ms)
 *   L2: Vercel KV / Upstash Redis (global, persistent, ~5-20ms)
 *   L3: Postgres RPC get_booster_product_json (single query, ~50-100ms)
 *
 * Booster product data is completely static — it never changes after import.
 */

import { createAdminClient } from "./supabase-admin";
import { kvGet, kvSet } from "./kv";

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

/** JSON-serializable shape returned by the Postgres function and stored in KV. */
interface BoosterProductJSON {
  productId: number;
  code: string;
  setCode: string;
  configs: BoosterConfig[];
  sheets: Array<{
    id: number;
    name: string;
    total_weight: number;
    cards: SheetCard[];
  }>;
}

// --- L1: Module-level cache ---

const boosterDataCache = new Map<string, BoosterProductData | null>();

// --- Hydration / Serialization ---

/** Convert JSON (array-based sheets) → BoosterProductData (Map-based sheets + allCardIdentifiers). */
function hydrateBoosterProductData(json: BoosterProductJSON): BoosterProductData {
  const sheetMap = new Map<number, BoosterSheet>();
  const identifierSet = new Map<string, { set: string; collector_number: string }>();

  for (const sheet of json.sheets) {
    sheetMap.set(sheet.id, {
      id: sheet.id,
      name: sheet.name,
      total_weight: Number(sheet.total_weight),
      cards: sheet.cards.map((c) => ({
        set_code: c.set_code,
        collector_number: c.collector_number,
        weight: Number(c.weight),
        is_foil: c.is_foil,
      })),
    });

    for (const card of sheet.cards) {
      const key = `${card.set_code}:${card.collector_number}`;
      if (!identifierSet.has(key)) {
        identifierSet.set(key, {
          set: card.set_code,
          collector_number: card.collector_number,
        });
      }
    }
  }

  return {
    productId: json.productId,
    code: json.code,
    setCode: json.setCode,
    configs: json.configs,
    sheets: sheetMap,
    allCardIdentifiers: Array.from(identifierSet.values()),
  };
}

/** Convert BoosterProductData → JSON for KV storage. */
function serializeBoosterProductData(data: BoosterProductData): BoosterProductJSON {
  return {
    productId: data.productId,
    code: data.code,
    setCode: data.setCode,
    configs: data.configs,
    sheets: Array.from(data.sheets.values()),
  };
}

// --- Single product loader (L1 → L2 → L3) ---

async function loadSingleProduct(code: string): Promise<BoosterProductData | null> {
  // L1: Module-level cache
  const l1 = boosterDataCache.get(code);
  if (l1 !== undefined) return l1;

  // L2: Vercel KV
  const kvKey = `booster:${code}`;
  const l2 = await kvGet<BoosterProductJSON>(kvKey);
  if (l2) {
    const hydrated = hydrateBoosterProductData(l2);
    boosterDataCache.set(code, hydrated);
    return hydrated;
  }

  // L3: Postgres RPC
  const supabase = createAdminClient();
  const { data: json } = await supabase.rpc("get_booster_product_json", {
    p_code: code,
  });

  if (!json) {
    boosterDataCache.set(code, null);
    return null;
  }

  const productJson = json as unknown as BoosterProductJSON;
  const hydrated = hydrateBoosterProductData(productJson);

  // Store in L1 + L2 (fire-and-forget for L2)
  boosterDataCache.set(code, hydrated);
  kvSet(kvKey, serializeBoosterProductData(hydrated)).catch(() => {});

  return hydrated;
}

// --- Public API ---

/**
 * Load booster product data for a set code.
 * Results are cached across all three layers.
 * When productCode is provided, queries by exact code.
 * Otherwise tries product codes in order: {set}-play, {set}-draft, {set}
 * Returns null if no product found (triggers fallback to template system).
 */
export async function loadBoosterProductData(
  setCode: string,
  productCode?: string
): Promise<BoosterProductData | null> {
  if (productCode) {
    return loadSingleProduct(productCode.toLowerCase());
  }

  const code = setCode.toLowerCase();
  const candidates = [`${code}-play`, `${code}-draft`, code];

  for (const candidate of candidates) {
    const result = await loadSingleProduct(candidate);
    if (result) return result;
  }

  return null;
}
