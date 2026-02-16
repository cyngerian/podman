import { describe, it, expect, vi, afterEach } from "vitest";
import {
  weightedRandomIndex,
  shuffleArray,
  getTemplateForSet,
  generatePack,
  generateAllPacks,
  generateCubePacks,
  PLAY_BOOSTER_TEMPLATE,
  DRAFT_BOOSTER_TEMPLATE,
} from "../pack-generator";
import type { CardReference, PackTemplate } from "../types";

afterEach(() => {
  vi.restoreAllMocks();
});

function makeCard(
  id: string,
  overrides?: Partial<CardReference>
): CardReference {
  return {
    scryfallId: id,
    name: `Card ${id}`,
    imageUri: "",
    smallImageUri: "",
    rarity: "common",
    colors: [],
    cmc: 0,
    isFoil: false,
    ...overrides,
  };
}

function makeCardPool(): Record<string, CardReference[]> {
  const commons = Array.from({ length: 80 }, (_, i) =>
    makeCard(`c${i}`, { rarity: "common" })
  );
  const uncommons = Array.from({ length: 30 }, (_, i) =>
    makeCard(`u${i}`, { rarity: "uncommon" })
  );
  const rares = Array.from({ length: 15 }, (_, i) =>
    makeCard(`r${i}`, { rarity: "rare" })
  );
  const mythics = Array.from({ length: 5 }, (_, i) =>
    makeCard(`m${i}`, { rarity: "mythic" })
  );
  const lands = Array.from({ length: 20 }, (_, i) =>
    makeCard(`l${i}`, { rarity: "common", name: `Land ${i}` })
  );
  return { common: commons, uncommon: uncommons, rare: rares, mythic: mythics, land: lands };
}

// === 1. weightedRandomIndex ===

describe("weightedRandomIndex", () => {
  it("returns 0 when random is near 0", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(weightedRandomIndex([6, 1])).toBe(0);
  });

  it("returns last index when random is near 1", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    expect(weightedRandomIndex([6, 1])).toBe(1);
  });

  it("returns 0 for single weight", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(weightedRandomIndex([10])).toBe(0);
  });

  it("selects proportionally to weights", () => {
    // Weight [6, 1], total 7. Boundary at 6/7 ≈ 0.857
    vi.spyOn(Math, "random").mockReturnValue(0.85);
    // roll = 0.85 * 7 = 5.95, subtract 6 → -0.05 ≤ 0 → index 0
    expect(weightedRandomIndex([6, 1])).toBe(0);

    vi.spyOn(Math, "random").mockReturnValue(0.86);
    // roll = 0.86 * 7 = 6.02, subtract 6 → 0.02 > 0, subtract 1 → -0.98 ≤ 0 → index 1
    expect(weightedRandomIndex([6, 1])).toBe(1);
  });

  it("handles three weights", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(weightedRandomIndex([1, 2, 3])).toBe(0);
  });
});

// === 2. shuffleArray ===

describe("shuffleArray", () => {
  it("does not mutate the original array", () => {
    const original = [1, 2, 3, 4, 5];
    const copy = [...original];
    shuffleArray(original);
    expect(original).toEqual(copy);
  });

  it("returns an array of the same length", () => {
    const result = shuffleArray([1, 2, 3]);
    expect(result).toHaveLength(3);
  });

  it("contains all original elements", () => {
    const result = shuffleArray([1, 2, 3, 4]);
    expect(result.sort()).toEqual([1, 2, 3, 4]);
  });

  it("handles empty array", () => {
    expect(shuffleArray([])).toEqual([]);
  });

  it("handles single element", () => {
    expect(shuffleArray([42])).toEqual([42]);
  });

  it("produces a deterministic result with mocked random", () => {
    // With random always returning 0, Fisher-Yates picks j=0 each time:
    // i=2: swap(2,0) → [3,2,1], i=1: swap(1,0) → [2,3,1]
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(shuffleArray([1, 2, 3])).toEqual([2, 3, 1]);
  });
});

// === 3. getTemplateForSet ===

describe("getTemplateForSet", () => {
  it("returns play booster template for play_booster era", () => {
    const template = getTemplateForSet("dsk", "play_booster");
    expect(template).toBe(PLAY_BOOSTER_TEMPLATE);
  });

  it("returns draft booster template for draft_booster era", () => {
    const template = getTemplateForSet("m21", "draft_booster");
    expect(template).toBe(DRAFT_BOOSTER_TEMPLATE);
  });

  it("returns custom template when set code matches", () => {
    const custom: PackTemplate = {
      id: "custom_xyz",
      setCode: "XYZ",
      era: "play_booster",
      slots: [],
    };
    const template = getTemplateForSet("xyz", "play_booster", [custom]);
    expect(template).toBe(custom);
  });

  it("matches set code case-insensitively", () => {
    const custom: PackTemplate = {
      id: "custom_abc",
      setCode: "abc",
      era: "play_booster",
      slots: [],
    };
    const template = getTemplateForSet("ABC", "play_booster", [custom]);
    expect(template).toBe(custom);
  });

  it("falls back to default when no custom template matches", () => {
    const custom: PackTemplate = {
      id: "custom_abc",
      setCode: "abc",
      era: "play_booster",
      slots: [],
    };
    const template = getTemplateForSet("xyz", "play_booster", [custom]);
    expect(template).toBe(PLAY_BOOSTER_TEMPLATE);
  });
});

// === 4. generatePack ===

describe("generatePack", () => {
  it("generates the correct number of cards for play booster", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const pool = makeCardPool();
    const pack = generatePack(pool, PLAY_BOOSTER_TEMPLATE);
    expect(pack).toHaveLength(PLAY_BOOSTER_TEMPLATE.slots.length);
  });

  it("generates the correct number of cards for draft booster", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const pool = makeCardPool();
    const pack = generatePack(pool, DRAFT_BOOSTER_TEMPLATE);
    expect(pack).toHaveLength(DRAFT_BOOSTER_TEMPLATE.slots.length);
  });

  it("has no duplicate scryfallIds within a pack", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const pool = makeCardPool();
    const pack = generatePack(pool, PLAY_BOOSTER_TEMPLATE);
    const ids = pack.map((c) => c.scryfallId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks foil slot cards with isFoil", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const pool = makeCardPool();
    const pack = generatePack(pool, PLAY_BOOSTER_TEMPLATE);
    // Slot 13 (index 12) is the foil wildcard slot
    const foilSlot = PLAY_BOOSTER_TEMPLATE.slots.findIndex((s) => s.isFoil);
    expect(foilSlot).toBeGreaterThanOrEqual(0);
    expect(pack[foilSlot].isFoil).toBe(true);
  });

  it("uses land pool for land slot", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const pool = makeCardPool();
    const pack = generatePack(pool, PLAY_BOOSTER_TEMPLATE);
    // Land slot is the one with specialPool "land"
    const landSlotIdx = PLAY_BOOSTER_TEMPLATE.slots.findIndex(
      (s) => s.specialPool === "land"
    );
    expect(pack[landSlotIdx].scryfallId).toMatch(/^l/);
  });

  it("falls back to other rarities when primary pool is empty", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const pool = makeCardPool();
    pool.mythic = []; // Empty mythic pool
    // Use a simple template with just a mythic slot that falls back to rare
    const template: PackTemplate = {
      id: "test",
      setCode: null,
      era: "play_booster",
      slots: [
        {
          position: 1,
          name: "rare_mythic",
          rarityPool: ["mythic", "rare"],
          allowDuplicates: false,
          isFoil: false,
        },
      ],
    };
    // Mock random to select mythic (index 0), but pool is empty → falls back to rare
    const pack = generatePack(pool, template);
    expect(pack).toHaveLength(1);
    expect(pack[0].rarity).toBe("rare");
  });
});

// === 5. generateAllPacks ===

describe("generateAllPacks", () => {
  it("generates correct total number of packs", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const pool = makeCardPool();
    const packs = generateAllPacks(pool, PLAY_BOOSTER_TEMPLATE, 8, 3);
    expect(packs).toHaveLength(24);
  });

  it("generates correct number for 2 players and 1 pack each", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.3);
    const pool = makeCardPool();
    const packs = generateAllPacks(pool, PLAY_BOOSTER_TEMPLATE, 2, 1);
    expect(packs).toHaveLength(2);
  });

  it("each pack has the expected card count", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const pool = makeCardPool();
    const packs = generateAllPacks(pool, DRAFT_BOOSTER_TEMPLATE, 2, 1);
    for (const pack of packs) {
      expect(pack).toHaveLength(DRAFT_BOOSTER_TEMPLATE.slots.length);
    }
  });
});

// === 6. generateCubePacks ===

describe("generateCubePacks", () => {
  it("generates the correct number of packs", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const cards = Array.from({ length: 360 }, (_, i) => makeCard(`cube${i}`));
    const packs = generateCubePacks(cards, 8, 3, 15);
    expect(packs).toHaveLength(24);
  });

  it("each pack has correct card count", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const cards = Array.from({ length: 360 }, (_, i) => makeCard(`cube${i}`));
    const packs = generateCubePacks(cards, 8, 3, 15);
    for (const pack of packs) {
      expect(pack).toHaveLength(15);
    }
  });

  it("has no duplicate cards across packs", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const cards = Array.from({ length: 360 }, (_, i) => makeCard(`cube${i}`));
    const packs = generateCubePacks(cards, 8, 3, 15);
    const allIds = packs.flat().map((c) => c.scryfallId);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("handles insufficient cards gracefully", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    // Only 10 cards but need 30 (2 players * 1 pack * 15 cards)
    const cards = Array.from({ length: 10 }, (_, i) => makeCard(`cube${i}`));
    const packs = generateCubePacks(cards, 2, 1, 15);
    // First pack gets 10 cards, second pack would be empty and not pushed
    expect(packs).toHaveLength(1);
    expect(packs[0]).toHaveLength(10);
  });

  it("does not mutate the input array", () => {
    const cards = Array.from({ length: 45 }, (_, i) => makeCard(`cube${i}`));
    const originalIds = cards.map((c) => c.scryfallId);
    generateCubePacks(cards, 1, 3, 15);
    expect(cards.map((c) => c.scryfallId)).toEqual(originalIds);
  });
});
