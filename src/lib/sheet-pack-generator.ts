/**
 * Sheet-based pack generation using booster distribution data.
 * Pure functions — no DB or network calls.
 */

import type { CardReference } from "./types";
import type { BoosterProductData, BoosterSheet } from "./booster-data";
import { weightedRandomIndex } from "./pack-generator";

// --- Types ---

export interface PackCardSkeleton {
  set_code: string;
  collector_number: string;
  is_foil: boolean;
  sheet_id: number;
}

/**
 * Build a lookup from "set_code:collector_number" → card name.
 * Used for name-based dedup: cards with the same name but different
 * collector numbers (e.g., showcase variants) are treated as duplicates.
 */
export function buildNameMap(cardMap: Map<string, CardReference>): Map<string, string> {
  const nameMap = new Map<string, string>();
  for (const [key, card] of cardMap) {
    nameMap.set(key, card.name);
  }
  return nameMap;
}

/**
 * Draw a single card from a sheet using weighted random selection.
 * Avoids cards whose dedup key (name if nameMap provided, else set:collector_number)
 * is already used. Returns the sheet card entry, or null if all cards are used.
 */
function drawFromSheet(
  sheet: BoosterSheet,
  usedNames: Set<string>,
  nameMap?: Map<string, string>
): { set_code: string; collector_number: string; is_foil: boolean } | null {
  // Try up to 50 times with weighted random, then fall back to exhaustive search
  for (let attempt = 0; attempt < 50; attempt++) {
    let roll = Math.random() * sheet.total_weight;
    for (const card of sheet.cards) {
      roll -= card.weight;
      if (roll <= 0) {
        const key = `${card.set_code}:${card.collector_number}`;
        const dedupKey = nameMap?.get(key) ?? key;
        if (!usedNames.has(dedupKey)) {
          return card;
        }
        break; // Card already used, re-roll
      }
    }
  }

  // Exhaustive fallback: find any unused card
  for (const card of sheet.cards) {
    const key = `${card.set_code}:${card.collector_number}`;
    const dedupKey = nameMap?.get(key) ?? key;
    if (!usedNames.has(dedupKey)) {
      return card;
    }
  }

  return null;
}

// --- Skeleton generation (no Scryfall needed) ---

/**
 * Generate a single pack skeleton — just card identifiers + foil flags.
 * Uses sheet weights to draw cards without needing Scryfall data.
 * Dedup is per-sheet (matching taw spec): cards with the same name on the
 * same sheet are rerolled, but cross-sheet duplicates are allowed.
 */
function generateSheetPackSkeleton(
  data: BoosterProductData,
  nameMap?: Map<string, string>
): PackCardSkeleton[] {
  const configWeights = data.configs.map((c) => c.weight);
  const configIdx = weightedRandomIndex(configWeights);
  const config = data.configs[configIdx];

  const pack: PackCardSkeleton[] = [];
  const usedNamesBySheet = new Map<number, Set<string>>();

  for (const slot of config.slots) {
    const sheet = data.sheets.get(slot.sheet_id);
    if (!sheet) continue;

    let sheetUsed = usedNamesBySheet.get(slot.sheet_id);
    if (!sheetUsed) {
      sheetUsed = new Set<string>();
      usedNamesBySheet.set(slot.sheet_id, sheetUsed);
    }

    for (let i = 0; i < slot.count; i++) {
      const drawn = drawFromSheet(sheet, sheetUsed, nameMap);
      if (!drawn) continue;

      const key = `${drawn.set_code}:${drawn.collector_number}`;
      const dedupKey = nameMap?.get(key) ?? key;
      sheetUsed.add(dedupKey);
      pack.push({
        set_code: drawn.set_code,
        collector_number: drawn.collector_number,
        is_foil: drawn.is_foil,
        sheet_id: slot.sheet_id,
      });
    }
  }

  return pack;
}

/**
 * Generate all pack skeletons for a draft.
 * Returns card identifiers only — fetch Scryfall data afterward.
 */
export function generateAllSheetPackSkeletons(
  data: BoosterProductData,
  playerCount: number,
  packsPerPlayer: number,
  nameMap?: Map<string, string>
): PackCardSkeleton[][] {
  const totalPacks = playerCount * packsPerPlayer;
  const packs: PackCardSkeleton[][] = [];

  for (let i = 0; i < totalPacks; i++) {
    packs.push(generateSheetPackSkeleton(data, nameMap));
  }

  return packs;
}

/**
 * Collect unique card identifiers from pack skeletons
 * for a targeted Scryfall fetch.
 */
export function collectSkeletonIdentifiers(
  skeletons: PackCardSkeleton[][]
): Array<{ set: string; collector_number: string }> {
  const seen = new Map<string, { set: string; collector_number: string }>();
  for (const pack of skeletons) {
    for (const card of pack) {
      const key = `${card.set_code}:${card.collector_number}`;
      if (!seen.has(key)) {
        seen.set(key, {
          set: card.set_code,
          collector_number: card.collector_number,
        });
      }
    }
  }
  return Array.from(seen.values());
}

/**
 * Resolve pack skeletons into full CardReferences using a cardMap.
 */
export function resolvePackSkeletons(
  skeletons: PackCardSkeleton[][],
  cardMap: Map<string, CardReference>
): CardReference[][] {
  return skeletons.map((pack) => {
    const resolved: CardReference[] = [];
    for (const card of pack) {
      const key = `${card.set_code}:${card.collector_number}`;
      const cardRef = cardMap.get(key);
      if (!cardRef) {
        console.warn(`[sheet-pack-gen] Card not found in cardMap: ${key}`);
        continue;
      }
      if (card.is_foil) {
        resolved.push({ ...cardRef, isFoil: true });
      } else {
        resolved.push(cardRef);
      }
    }
    return resolved;
  });
}

// --- Legacy API (used by test-packs validation script) ---

/**
 * Generate a single pack with a pre-built cardMap.
 * Prefer generateAllSheetPackSkeletons + resolvePackSkeletons for production
 * (fetches only the cards actually drawn instead of the entire set).
 */
export function generateSheetPack(
  data: BoosterProductData,
  cardMap: Map<string, CardReference>
): CardReference[] {
  const nameMap = buildNameMap(cardMap);
  const skeleton = generateSheetPackSkeleton(data, nameMap);
  return resolvePackSkeletons([skeleton], cardMap)[0];
}

/**
 * Generate all packs with a pre-built cardMap.
 * Used by test-packs validation script which needs the full cardMap anyway.
 */
export function generateAllSheetPacks(
  data: BoosterProductData,
  cardMap: Map<string, CardReference>,
  playerCount: number,
  packsPerPlayer: number
): CardReference[][] {
  const nameMap = buildNameMap(cardMap);
  const skeletons = generateAllSheetPackSkeletons(
    data,
    playerCount,
    packsPerPlayer,
    nameMap
  );
  return resolvePackSkeletons(skeletons, cardMap);
}
