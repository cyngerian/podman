/**
 * Pack generation orchestration.
 * Tries sheet-based generation first (booster distribution data),
 * falls back to template-based generation if the set isn't in the database.
 */

import type { CardReference } from "./types";
import { loadBoosterProductData } from "./booster-data";
import { fetchCardsByCollectorNumber } from "./scryfall";
import {
  generateAllSheetPackSkeletons,
  collectSkeletonIdentifiers,
  resolvePackSkeletons,
  buildNameMap,
} from "./sheet-pack-generator";
import {
  fetchBoosterCards,
  groupCardsByRarity,
  scryfallCardToReference,
  fetchSetInfo,
  getPackEra,
} from "./scryfall";
import { getTemplateForSet, generateAllPacks } from "./pack-generator";

/**
 * Remove non-foil basic lands from packs (not useful draft picks).
 * Foil basics are kept — they're interesting pulls.
 */
function stripNonFoilBasicLands(packs: CardReference[][]): CardReference[][] {
  return packs.map((pack) =>
    pack.filter(
      (card) => card.isFoil || !card.typeLine?.startsWith("Basic Land")
    )
  );
}

export interface GeneratePacksOptions {
  productCode?: string;
  keepBasicLands?: boolean;
}

/**
 * Generate all packs for a single set.
 * Tries sheet-based generation first, falls back to template system.
 * Non-foil basic lands are stripped unless keepBasicLands is set.
 */
export async function generatePacksForSet(
  setCode: string,
  playerCount: number,
  packsPerPlayer: number,
  options?: GeneratePacksOptions
): Promise<CardReference[][]> {
  const { productCode, keepBasicLands } = options ?? {};

  // Try sheet-based generation: build packs first, then fetch only selected cards
  const boosterData = await loadBoosterProductData(setCode, productCode);

  if (boosterData) {
    // Pre-fetch all cards in the product to build name lookup for dedup.
    // Results are cached in scryfallCardCache, so the targeted fetch below
    // will be 100% cache hits — no extra API calls.
    const allCards = await fetchCardsByCollectorNumber(boosterData.allCardIdentifiers);
    const nameMap = buildNameMap(allCards);

    const skeletons = generateAllSheetPackSkeletons(
      boosterData,
      playerCount,
      packsPerPlayer,
      nameMap
    );
    const neededIds = collectSkeletonIdentifiers(skeletons);
    const cardMap = await fetchCardsByCollectorNumber(neededIds);
    if (cardMap.size > 0) {
      const packs = resolvePackSkeletons(skeletons, cardMap);
      return keepBasicLands ? packs : stripNonFoilBasicLands(packs);
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
  const packs = generateAllPacks(cardPool, template, playerCount, packsPerPlayer);
  return keepBasicLands ? packs : stripNonFoilBasicLands(packs);
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

  // Deduplicate set codes and pre-load booster data in parallel (cache warming)
  const uniqueCodes = [...new Set(packSets.map((s) => s.code))];
  await Promise.all(uniqueCodes.map((code) => loadBoosterProductData(code)));

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
