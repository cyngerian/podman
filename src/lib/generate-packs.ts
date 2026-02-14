/**
 * Pack generation orchestration.
 * Tries sheet-based generation first (booster distribution data),
 * falls back to template-based generation if the set isn't in the database.
 */

import type { CardReference } from "./types";
import { loadBoosterProductData } from "./booster-data";
import { fetchCardsByCollectorNumber } from "./scryfall";
import { generateAllSheetPacks } from "./sheet-pack-generator";
import {
  fetchBoosterCards,
  groupCardsByRarity,
  scryfallCardToReference,
  fetchSetInfo,
  getPackEra,
} from "./scryfall";
import { getTemplateForSet, generateAllPacks } from "./pack-generator";

/**
 * Generate all packs for a single set.
 * Tries sheet-based generation first, falls back to template system.
 */
export async function generatePacksForSet(
  setCode: string,
  playerCount: number,
  packsPerPlayer: number
): Promise<CardReference[][]> {
  // Try sheet-based generation
  const boosterData = await loadBoosterProductData(setCode);

  if (boosterData) {
    const cardMap = await fetchCardsByCollectorNumber(
      boosterData.allCardIdentifiers
    );
    if (cardMap.size > 0) {
      return generateAllSheetPacks(
        boosterData,
        cardMap,
        playerCount,
        packsPerPlayer
      );
    }
  }

  // Fallback: template-based generation
  const [scryfallCards, setInfo] = await Promise.all([
    fetchBoosterCards(setCode),
    fetchSetInfo(setCode),
  ]);
  const grouped = groupCardsByRarity(scryfallCards);

  const cardPool: Record<string, CardReference[]> = {
    common: grouped.common.map((c) => scryfallCardToReference(c)),
    uncommon: grouped.uncommon.map((c) => scryfallCardToReference(c)),
    rare: grouped.rare.map((c) => scryfallCardToReference(c)),
    mythic: grouped.mythic.map((c) => scryfallCardToReference(c)),
    land: grouped.land.map((c) => scryfallCardToReference(c)),
  };

  const era = getPackEra(setInfo.released_at);
  const template = getTemplateForSet(setCode, era);
  return generateAllPacks(cardPool, template, playerCount, packsPerPlayer);
}

/**
 * Generate packs for a mixed-set draft (different set per round).
 * Each round generates playerCount packs from that round's set.
 */
export async function generateMixedPacks(
  packSets: Array<{ code: string; name: string }>,
  playerCount: number
): Promise<CardReference[][]> {
  const allPacks: CardReference[][] = [];

  // Deduplicate set codes and pre-load booster data in parallel
  const uniqueCodes = [...new Set(packSets.map((s) => s.code))];
  const boosterDataBySet = new Map<
    string,
    Awaited<ReturnType<typeof loadBoosterProductData>>
  >();

  const dataResults = await Promise.all(
    uniqueCodes.map(async (code) => {
      const data = await loadBoosterProductData(code);
      return { code, data };
    })
  );
  for (const { code, data } of dataResults) {
    boosterDataBySet.set(code, data);
  }

  // Generate packs round by round
  for (const packSet of packSets) {
    const roundPacks = await generatePacksForSet(
      packSet.code,
      playerCount,
      1
    );
    allPacks.push(...roundPacks);
  }

  return allPacks;
}
