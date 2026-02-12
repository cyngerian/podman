import type {
  CardReference,
  PackTemplate,
  PackSlot,
  PackEra,
  Rarity,
} from "./types";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Given an array of weights, return a random index proportional to weights.
 * e.g. weightedRandomIndex([6, 1]) returns 0 ~85.7% of the time, 1 ~14.3%.
 */
export function weightedRandomIndex(weights: number[]): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

/**
 * Fisher-Yates shuffle. Returns a new array; does not mutate the input.
 */
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ============================================================================
// Default Pack Templates
// ============================================================================

function makeSlot(
  position: number,
  name: string,
  rarityPool: Rarity[],
  options: {
    rarityWeights?: number[];
    allowDuplicates?: boolean;
    isFoil?: boolean;
    specialPool?: string;
  } = {}
): PackSlot {
  return {
    position,
    name,
    rarityPool,
    ...(options.rarityWeights ? { rarityWeights: options.rarityWeights } : {}),
    allowDuplicates: options.allowDuplicates ?? false,
    isFoil: options.isFoil ?? false,
    ...(options.specialPool ? { specialPool: options.specialPool } : {}),
  };
}

/**
 * Play Booster template for modern sets (14 cards).
 */
export const PLAY_BOOSTER_TEMPLATE: PackTemplate = {
  id: "default_play_booster",
  setCode: null,
  era: "play_booster",
  slots: [
    // Slots 1-6: Common
    makeSlot(1, "common", ["common"]),
    makeSlot(2, "common", ["common"]),
    makeSlot(3, "common", ["common"]),
    makeSlot(4, "common", ["common"]),
    makeSlot(5, "common", ["common"]),
    makeSlot(6, "common", ["common"]),
    // Slots 7-9: Uncommon
    makeSlot(7, "uncommon", ["uncommon"]),
    makeSlot(8, "uncommon", ["uncommon"]),
    makeSlot(9, "uncommon", ["uncommon"]),
    // Slot 10: Rare/Mythic
    makeSlot(10, "rare_mythic", ["rare", "mythic"], {
      rarityWeights: [6, 1],
    }),
    // Slot 11: Land
    makeSlot(11, "land", ["common"], { specialPool: "land" }),
    // Slot 12: Wildcard
    makeSlot(12, "wildcard", ["common", "uncommon", "rare", "mythic"], {
      rarityWeights: [70, 20, 8, 2],
    }),
    // Slot 13: Wildcard Foil
    makeSlot(13, "wildcard", ["common", "uncommon", "rare", "mythic"], {
      rarityWeights: [70, 20, 8, 2],
      isFoil: true,
    }),
    // Slot 14 is implicit in the 14-card count — the template has 13 explicit
    // slots above but positions 1-13 cover 13 cards. Play Boosters actually
    // have 14 cards; the 14th is an art/ad card in paper but is often omitted
    // in digital drafts. We keep 13 gameplay-relevant slots to match the
    // standard digital Play Booster experience (14 positions with the land).
  ],
};

/**
 * Draft Booster template for legacy/pre-MOM sets (15 cards).
 */
export const DRAFT_BOOSTER_TEMPLATE: PackTemplate = {
  id: "default_draft_booster",
  setCode: null,
  era: "draft_booster",
  slots: [
    // Slots 1-10: Common
    makeSlot(1, "common", ["common"]),
    makeSlot(2, "common", ["common"]),
    makeSlot(3, "common", ["common"]),
    makeSlot(4, "common", ["common"]),
    makeSlot(5, "common", ["common"]),
    makeSlot(6, "common", ["common"]),
    makeSlot(7, "common", ["common"]),
    makeSlot(8, "common", ["common"]),
    makeSlot(9, "common", ["common"]),
    makeSlot(10, "common", ["common"]),
    // Slots 11-13: Uncommon
    makeSlot(11, "uncommon", ["uncommon"]),
    makeSlot(12, "uncommon", ["uncommon"]),
    makeSlot(13, "uncommon", ["uncommon"]),
    // Slot 14: Rare/Mythic
    makeSlot(14, "rare_mythic", ["rare", "mythic"], {
      rarityWeights: [6, 1],
    }),
    // Slot 15: Land
    makeSlot(15, "land", ["common"], { specialPool: "land" }),
  ],
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Look for a custom template matching the given setCode, then fall back to
 * the default template for the era.
 */
export function getTemplateForSet(
  setCode: string,
  era: PackEra,
  customTemplates?: PackTemplate[]
): PackTemplate {
  if (customTemplates) {
    const match = customTemplates.find(
      (t) => t.setCode?.toLowerCase() === setCode.toLowerCase()
    );
    if (match) return match;
  }

  return era === "play_booster" ? PLAY_BOOSTER_TEMPLATE : DRAFT_BOOSTER_TEMPLATE;
}

/**
 * Pick a rarity for a given slot, respecting rarityWeights if present.
 */
function pickRarityForSlot(slot: PackSlot): Rarity {
  if (slot.rarityWeights && slot.rarityWeights.length === slot.rarityPool.length) {
    const idx = weightedRandomIndex(slot.rarityWeights);
    return slot.rarityPool[idx];
  }
  // No weights — pick uniformly at random from the pool
  return slot.rarityPool[Math.floor(Math.random() * slot.rarityPool.length)];
}

/**
 * Generate a single pack from the card pool using the given template.
 *
 * For each slot in the template:
 *   1. Determine which rarity to use (weighted random if rarityWeights present)
 *   2. Pick a random card from that rarity in the card pool
 *   3. Ensure no duplicate scryfallIds within this pack
 *   4. If isFoil, set isFoil=true on a copy of the card
 *
 * @param cardPool  Cards available, keyed by rarity.
 * @param template  The pack template defining each slot.
 * @param existingPacks  Optional previously generated packs (unused for now,
 *                       reserved for future cross-pack duplicate avoidance).
 * @returns Array of CardReferences representing one pack.
 */
export function generatePack(
  cardPool: Record<Rarity, CardReference[]>,
  template: PackTemplate,
  existingPacks?: CardReference[][]
): CardReference[] {
  const pack: CardReference[] = [];
  const usedIds = new Set<string>();

  for (const slot of template.slots) {
    const rarity = pickRarityForSlot(slot);
    const pool = cardPool[rarity];

    if (!pool || pool.length === 0) {
      // If the selected rarity pool is empty, try other rarities in the slot
      let card: CardReference | null = null;
      for (const fallbackRarity of slot.rarityPool) {
        const fallbackPool = cardPool[fallbackRarity];
        if (fallbackPool && fallbackPool.length > 0) {
          card = pickCardFromPool(fallbackPool, usedIds, slot.allowDuplicates);
          if (card) break;
        }
      }
      if (card) {
        if (slot.isFoil) {
          card = { ...card, isFoil: true };
        }
        pack.push(card);
        if (!slot.allowDuplicates) {
          usedIds.add(card.scryfallId);
        }
      }
      continue;
    }

    const card = pickCardFromPool(pool, usedIds, slot.allowDuplicates);
    if (card) {
      const finalCard = slot.isFoil ? { ...card, isFoil: true } : card;
      pack.push(finalCard);
      if (!slot.allowDuplicates) {
        usedIds.add(card.scryfallId);
      }
    }
  }

  return pack;
}

/**
 * Pick a random card from a pool, avoiding duplicates within the current pack
 * when allowDuplicates is false. Tries up to 100 times before giving up and
 * accepting a duplicate rather than returning nothing.
 */
function pickCardFromPool(
  pool: CardReference[],
  usedIds: Set<string>,
  allowDuplicates: boolean
): CardReference | null {
  if (pool.length === 0) return null;

  if (allowDuplicates) {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Try to find a non-duplicate
  const maxAttempts = 100;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const card = pool[Math.floor(Math.random() * pool.length)];
    if (!usedIds.has(card.scryfallId)) {
      return card;
    }
  }

  // Exhaustive search as a last resort
  const shuffled = shuffleArray(pool);
  for (const card of shuffled) {
    if (!usedIds.has(card.scryfallId)) {
      return card;
    }
  }

  // All cards in pool are already used — return any card as fallback
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Generate all packs for a draft session.
 *
 * @param cardPool        Cards available, keyed by rarity.
 * @param template        The pack template to use for each pack.
 * @param playerCount     Number of players in the draft.
 * @param packsPerPlayer  Number of packs each player opens (usually 3).
 * @returns Array of packs (each pack is an array of CardReferences).
 */
export function generateAllPacks(
  cardPool: Record<Rarity, CardReference[]>,
  template: PackTemplate,
  playerCount: number,
  packsPerPlayer: number
): CardReference[][] {
  const totalPacks = playerCount * packsPerPlayer;
  const packs: CardReference[][] = [];

  for (let i = 0; i < totalPacks; i++) {
    const pack = generatePack(cardPool, template, packs);
    packs.push(pack);
  }

  return packs;
}

/**
 * Generate packs for a Cube draft. No rarity-based logic — the cube card list
 * is shuffled and dealt evenly into packs of the given size.
 *
 * @param cubeCards       The full list of cards in the cube.
 * @param playerCount     Number of players.
 * @param packsPerPlayer  Number of packs each player opens (usually 3).
 * @param cardsPerPack    Number of cards in each pack (e.g. 15).
 * @returns Array of packs.
 */
export function generateCubePacks(
  cubeCards: CardReference[],
  playerCount: number,
  packsPerPlayer: number,
  cardsPerPack: number
): CardReference[][] {
  const totalPacks = playerCount * packsPerPlayer;
  const totalCardsNeeded = totalPacks * cardsPerPack;

  const shuffled = shuffleArray(cubeCards);

  // If the cube has fewer cards than needed, use what we have
  const available = shuffled.slice(0, totalCardsNeeded);

  const packs: CardReference[][] = [];
  for (let i = 0; i < totalPacks; i++) {
    const start = i * cardsPerPack;
    const end = start + cardsPerPack;
    const pack = available.slice(start, end);
    if (pack.length > 0) {
      packs.push(pack);
    }
  }

  return packs;
}
