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
}

/**
 * Draw a single card from a sheet using weighted random selection.
 * Avoids cards already used in this pack (no replacement).
 * Returns the sheet card entry, or null if all cards are used.
 */
function drawFromSheet(
  sheet: BoosterSheet,
  usedKeys: Set<string>
): { set_code: string; collector_number: string; is_foil: boolean } | null {
  // Try up to 50 times with weighted random, then fall back to exhaustive search
  for (let attempt = 0; attempt < 50; attempt++) {
    let roll = Math.random() * sheet.total_weight;
    for (const card of sheet.cards) {
      roll -= card.weight;
      if (roll <= 0) {
        const key = `${card.set_code}:${card.collector_number}`;
        if (!usedKeys.has(key)) {
          return card;
        }
        break; // Card already used, re-roll
      }
    }
  }

  // Exhaustive fallback: find any unused card
  for (const card of sheet.cards) {
    const key = `${card.set_code}:${card.collector_number}`;
    if (!usedKeys.has(key)) {
      return card;
    }
  }

  return null;
}

// --- Skeleton generation (no Scryfall needed) ---

/**
 * Generate a single pack skeleton — just card identifiers + foil flags.
 * Uses sheet weights to draw cards without needing Scryfall data.
 */
function generateSheetPackSkeleton(
  data: BoosterProductData
): PackCardSkeleton[] {
  const configWeights = data.configs.map((c) => c.weight);
  const configIdx = weightedRandomIndex(configWeights);
  const config = data.configs[configIdx];

  const pack: PackCardSkeleton[] = [];
  const usedKeys = new Set<string>();

  for (const slot of config.slots) {
    const sheet = data.sheets.get(slot.sheet_id);
    if (!sheet) continue;

    for (let i = 0; i < slot.count; i++) {
      const drawn = drawFromSheet(sheet, usedKeys);
      if (!drawn) continue;

      const key = `${drawn.set_code}:${drawn.collector_number}`;
      usedKeys.add(key);
      pack.push({
        set_code: drawn.set_code,
        collector_number: drawn.collector_number,
        is_foil: drawn.is_foil,
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
  packsPerPlayer: number
): PackCardSkeleton[][] {
  const totalPacks = playerCount * packsPerPlayer;
  const packs: PackCardSkeleton[][] = [];

  for (let i = 0; i < totalPacks; i++) {
    packs.push(generateSheetPackSkeleton(data));
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
  const skeleton = generateSheetPackSkeleton(data);
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
  const skeletons = generateAllSheetPackSkeletons(
    data,
    playerCount,
    packsPerPlayer
  );
  return resolvePackSkeletons(skeletons, cardMap);
}
