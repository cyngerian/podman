/**
 * Sheet-based pack generation using booster distribution data.
 * Pure functions — no DB or network calls.
 */

import type { CardReference } from "./types";
import type { BoosterProductData, BoosterSheet } from "./booster-data";
import { weightedRandomIndex } from "./pack-generator";

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

/**
 * Generate a single pack from booster distribution data.
 *
 * 1. Pick a config via weighted random selection
 * 2. For each slot in the config, draw cards from the named sheet
 * 3. Map each card to a CardReference via the cardMap
 */
export function generateSheetPack(
  data: BoosterProductData,
  cardMap: Map<string, CardReference>
): CardReference[] {
  // Pick a config
  const configWeights = data.configs.map((c) => c.weight);
  const configIdx = weightedRandomIndex(configWeights);
  const config = data.configs[configIdx];

  const pack: CardReference[] = [];
  const usedKeys = new Set<string>();

  for (const slot of config.slots) {
    const sheet = data.sheets.get(slot.sheet_id);
    if (!sheet) continue;

    for (let i = 0; i < slot.count; i++) {
      const drawn = drawFromSheet(sheet, usedKeys);
      if (!drawn) continue;

      const key = `${drawn.set_code}:${drawn.collector_number}`;
      usedKeys.add(key);

      const cardRef = cardMap.get(key);
      if (!cardRef) {
        console.warn(`[sheet-pack-gen] Card not found in cardMap: ${key}`);
        continue;
      }

      if (drawn.is_foil) {
        pack.push({ ...cardRef, isFoil: true });
      } else {
        pack.push(cardRef);
      }
    }
  }

  return pack;
}

/**
 * Generate all packs for a draft using sheet-based generation.
 */
export function generateAllSheetPacks(
  data: BoosterProductData,
  cardMap: Map<string, CardReference>,
  playerCount: number,
  packsPerPlayer: number
): CardReference[][] {
  const totalPacks = playerCount * packsPerPlayer;
  const packs: CardReference[][] = [];

  for (let i = 0; i < totalPacks; i++) {
    packs.push(generateSheetPack(data, cardMap));
  }

  return packs;
}
