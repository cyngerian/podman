import { describe, it, expect, vi, afterEach } from "vitest";
import {
  collectSkeletonIdentifiers,
  resolvePackSkeletons,
  generateAllSheetPackSkeletons,
  generateSheetPack,
  generateAllSheetPacks,
  buildNameMap,
} from "../sheet-pack-generator";
import type { PackCardSkeleton } from "../sheet-pack-generator";
import type {
  BoosterProductData,
  BoosterSheet,
  BoosterConfig,
} from "../booster-data";
import type { CardReference } from "../types";

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

function makeSheet(
  id: number,
  cards: Array<{ set_code: string; collector_number: string; weight: number; is_foil: boolean }>
): BoosterSheet {
  return {
    id,
    name: `Sheet ${id}`,
    total_weight: cards.reduce((sum, c) => sum + c.weight, 0),
    cards,
  };
}

function makeProductData(overrides?: {
  configs?: BoosterConfig[];
  sheets?: Map<number, BoosterSheet>;
}): BoosterProductData {
  const sheet1 = makeSheet(1, [
    { set_code: "tst", collector_number: "1", weight: 1, is_foil: false },
    { set_code: "tst", collector_number: "2", weight: 1, is_foil: false },
    { set_code: "tst", collector_number: "3", weight: 1, is_foil: false },
    { set_code: "tst", collector_number: "4", weight: 1, is_foil: false },
    { set_code: "tst", collector_number: "5", weight: 1, is_foil: false },
  ]);
  const sheet2 = makeSheet(2, [
    { set_code: "tst", collector_number: "100", weight: 1, is_foil: true },
    { set_code: "tst", collector_number: "101", weight: 1, is_foil: true },
  ]);
  const defaultSheets = new Map<number, BoosterSheet>([
    [1, sheet1],
    [2, sheet2],
  ]);
  const defaultConfigs: BoosterConfig[] = [
    {
      id: 1,
      weight: 1,
      slots: [
        { sheet_id: 1, count: 3 },
        { sheet_id: 2, count: 1 },
      ],
    },
  ];
  return {
    productId: 1,
    code: "test-product",
    setCode: "tst",
    configs: overrides?.configs ?? defaultConfigs,
    sheets: overrides?.sheets ?? defaultSheets,
    allCardIdentifiers: [],
  };
}

function makeCardMap(): Map<string, CardReference> {
  const map = new Map<string, CardReference>();
  for (let i = 1; i <= 5; i++) {
    map.set(`tst:${i}`, makeCard(`sf-${i}`, { name: `Card ${i}` }));
  }
  map.set("tst:100", makeCard("sf-100", { name: "Foil Card 100" }));
  map.set("tst:101", makeCard("sf-101", { name: "Foil Card 101" }));
  return map;
}

// === 1. collectSkeletonIdentifiers ===

describe("collectSkeletonIdentifiers", () => {
  it("collects unique identifiers from pack skeletons", () => {
    const skeletons: PackCardSkeleton[][] = [
      [
        { set_code: "tst", collector_number: "1", is_foil: false },
        { set_code: "tst", collector_number: "2", is_foil: false },
      ],
      [
        { set_code: "tst", collector_number: "1", is_foil: false },
        { set_code: "tst", collector_number: "3", is_foil: true },
      ],
    ];
    const ids = collectSkeletonIdentifiers(skeletons);
    expect(ids).toHaveLength(3);
    expect(ids).toContainEqual({ set: "tst", collector_number: "1" });
    expect(ids).toContainEqual({ set: "tst", collector_number: "2" });
    expect(ids).toContainEqual({ set: "tst", collector_number: "3" });
  });

  it("deduplicates same set+collector across packs", () => {
    const skeletons: PackCardSkeleton[][] = [
      [{ set_code: "abc", collector_number: "10", is_foil: false }],
      [{ set_code: "abc", collector_number: "10", is_foil: true }],
    ];
    const ids = collectSkeletonIdentifiers(skeletons);
    expect(ids).toHaveLength(1);
  });

  it("returns empty for empty skeletons", () => {
    expect(collectSkeletonIdentifiers([])).toEqual([]);
  });

  it("returns empty for skeletons with empty packs", () => {
    expect(collectSkeletonIdentifiers([[], []])).toEqual([]);
  });
});

// === 2. resolvePackSkeletons ===

describe("resolvePackSkeletons", () => {
  it("resolves skeletons to CardReferences using cardMap", () => {
    const skeletons: PackCardSkeleton[][] = [
      [
        { set_code: "tst", collector_number: "1", is_foil: false },
        { set_code: "tst", collector_number: "2", is_foil: false },
      ],
    ];
    const cardMap = makeCardMap();
    const packs = resolvePackSkeletons(skeletons, cardMap);
    expect(packs).toHaveLength(1);
    expect(packs[0]).toHaveLength(2);
    expect(packs[0][0].scryfallId).toBe("sf-1");
    expect(packs[0][1].scryfallId).toBe("sf-2");
  });

  it("sets isFoil on foil cards", () => {
    const skeletons: PackCardSkeleton[][] = [
      [{ set_code: "tst", collector_number: "1", is_foil: true }],
    ];
    const cardMap = makeCardMap();
    const packs = resolvePackSkeletons(skeletons, cardMap);
    expect(packs[0][0].isFoil).toBe(true);
  });

  it("does not set isFoil on non-foil cards", () => {
    const skeletons: PackCardSkeleton[][] = [
      [{ set_code: "tst", collector_number: "1", is_foil: false }],
    ];
    const cardMap = makeCardMap();
    const packs = resolvePackSkeletons(skeletons, cardMap);
    expect(packs[0][0].isFoil).toBe(false);
  });

  it("skips cards not found in cardMap and warns", () => {
    const skeletons: PackCardSkeleton[][] = [
      [
        { set_code: "tst", collector_number: "1", is_foil: false },
        { set_code: "tst", collector_number: "999", is_foil: false },
      ],
    ];
    const cardMap = makeCardMap();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const packs = resolvePackSkeletons(skeletons, cardMap);
    expect(packs[0]).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[sheet-pack-gen] Card not found in cardMap: tst:999"
    );
  });

  it("handles empty skeletons", () => {
    const packs = resolvePackSkeletons([], new Map());
    expect(packs).toEqual([]);
  });
});

// === 3. generateAllSheetPackSkeletons ===

describe("generateAllSheetPackSkeletons", () => {
  it("generates correct total number of packs", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const data = makeProductData();
    const skeletons = generateAllSheetPackSkeletons(data, 4, 3);
    expect(skeletons).toHaveLength(12);
  });

  it("each pack has the expected card count from config slots", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const data = makeProductData();
    const skeletons = generateAllSheetPackSkeletons(data, 1, 1);
    // Config has slot count 3 + 1 = 4 cards per pack
    expect(skeletons[0]).toHaveLength(4);
  });

  it("does not have duplicate cards within a single pack", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const data = makeProductData();
    const skeletons = generateAllSheetPackSkeletons(data, 1, 1);
    const keys = skeletons[0].map(
      (s) => `${s.set_code}:${s.collector_number}`
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("selects config using weighted random when multiple configs exist", () => {
    const sheet = makeSheet(1, [
      { set_code: "tst", collector_number: "1", weight: 1, is_foil: false },
      { set_code: "tst", collector_number: "2", weight: 1, is_foil: false },
    ]);
    const sheets = new Map<number, BoosterSheet>([[1, sheet]]);
    const configs: BoosterConfig[] = [
      { id: 1, weight: 1, slots: [{ sheet_id: 1, count: 1 }] },
      { id: 2, weight: 99, slots: [{ sheet_id: 1, count: 2 }] },
    ];
    const data = makeProductData({ configs, sheets });

    // random=0 → weightedRandomIndex picks config 0 (weight 1), which has count=1
    vi.spyOn(Math, "random").mockReturnValue(0);
    const skeletons = generateAllSheetPackSkeletons(data, 1, 1);
    expect(skeletons[0]).toHaveLength(1);
  });

  it("marks foil cards based on sheet is_foil flag", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const data = makeProductData();
    const skeletons = generateAllSheetPackSkeletons(data, 1, 1);
    // First 3 cards from sheet 1 (non-foil), last card from sheet 2 (foil)
    const nonFoils = skeletons[0].filter((s) => !s.is_foil);
    const foils = skeletons[0].filter((s) => s.is_foil);
    expect(nonFoils).toHaveLength(3);
    expect(foils).toHaveLength(1);
  });
});

// === 4. generateSheetPack (legacy API) ===

describe("generateSheetPack", () => {
  it("returns resolved CardReferences for a single pack", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const data = makeProductData();
    const cardMap = makeCardMap();
    const pack = generateSheetPack(data, cardMap);
    expect(pack).toHaveLength(4);
    for (const card of pack) {
      expect(card.scryfallId).toBeTruthy();
      expect(card.name).toBeTruthy();
    }
  });

  it("sets isFoil on cards from foil sheets", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const data = makeProductData();
    const cardMap = makeCardMap();
    const pack = generateSheetPack(data, cardMap);
    const foils = pack.filter((c) => c.isFoil);
    expect(foils.length).toBeGreaterThanOrEqual(1);
  });
});

// === 5. generateAllSheetPacks ===

describe("generateAllSheetPacks", () => {
  it("generates correct total number of resolved packs", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const data = makeProductData();
    const cardMap = makeCardMap();
    const packs = generateAllSheetPacks(data, cardMap, 2, 3);
    expect(packs).toHaveLength(6);
  });

  it("each pack contains resolved CardReferences", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const data = makeProductData();
    const cardMap = makeCardMap();
    const packs = generateAllSheetPacks(data, cardMap, 1, 1);
    expect(packs[0]).toHaveLength(4);
    expect(packs[0][0].scryfallId).toBeTruthy();
  });
});

// === 6. Name-based dedup ===

describe("buildNameMap", () => {
  it("builds name lookup from cardMap", () => {
    const cardMap = new Map<string, CardReference>([
      ["tst:1", makeCard("sf-1", { name: "Lightning Bolt" })],
      ["tst:2", makeCard("sf-2", { name: "Counterspell" })],
    ]);
    const nameMap = buildNameMap(cardMap);
    expect(nameMap.get("tst:1")).toBe("Lightning Bolt");
    expect(nameMap.get("tst:2")).toBe("Counterspell");
    expect(nameMap.size).toBe(2);
  });
});

describe("name-based dedup in skeleton generation", () => {
  it("deduplicates by card name within same sheet", () => {
    // Two cards on one sheet with different collector numbers but same name
    const sheet = makeSheet(1, [
      { set_code: "tst", collector_number: "1", weight: 1, is_foil: false },
      { set_code: "tst", collector_number: "300", weight: 1, is_foil: false },
    ]);
    const sheets = new Map<number, BoosterSheet>([[1, sheet]]);
    const configs: BoosterConfig[] = [
      { id: 1, weight: 1, slots: [{ sheet_id: 1, count: 2 }] },
    ];
    const data = makeProductData({ configs, sheets });

    // nameMap maps both collector numbers to the same name
    const nameMap = new Map<string, string>([
      ["tst:1", "Same Card"],
      ["tst:300", "Same Card"],
    ]);

    vi.spyOn(Math, "random").mockReturnValue(0);
    const skeletons = generateAllSheetPackSkeletons(data, 1, 1, nameMap);
    // Only 1 card drawn because both share the same name on the same sheet
    expect(skeletons[0]).toHaveLength(1);
  });

  it("allows same-name cards from different sheets", () => {
    // Same-name cards on two different sheets → both drawn (cross-sheet dupes allowed)
    const sheet1 = makeSheet(1, [
      { set_code: "tst", collector_number: "1", weight: 1, is_foil: false },
    ]);
    const sheet2 = makeSheet(2, [
      { set_code: "tst", collector_number: "200", weight: 1, is_foil: true },
    ]);
    const sheets = new Map<number, BoosterSheet>([
      [1, sheet1],
      [2, sheet2],
    ]);
    const configs: BoosterConfig[] = [
      {
        id: 1,
        weight: 1,
        slots: [
          { sheet_id: 1, count: 1 },
          { sheet_id: 2, count: 1 },
        ],
      },
    ];
    const data = makeProductData({ configs, sheets });

    const nameMap = new Map<string, string>([
      ["tst:1", "Same Card"],
      ["tst:200", "Same Card"],
    ]);

    vi.spyOn(Math, "random").mockReturnValue(0);
    const skeletons = generateAllSheetPackSkeletons(data, 1, 1, nameMap);
    // Both drawn because they're from different sheets
    expect(skeletons[0]).toHaveLength(2);
  });

  it("falls back to collector number dedup when nameMap not provided", () => {
    // Two cards with different collector numbers, no nameMap → both drawn
    const sheet = makeSheet(1, [
      { set_code: "tst", collector_number: "1", weight: 1, is_foil: false },
      { set_code: "tst", collector_number: "300", weight: 1, is_foil: false },
    ]);
    const sheets = new Map<number, BoosterSheet>([[1, sheet]]);
    const configs: BoosterConfig[] = [
      { id: 1, weight: 1, slots: [{ sheet_id: 1, count: 2 }] },
    ];
    const data = makeProductData({ configs, sheets });

    vi.spyOn(Math, "random").mockReturnValue(0);
    const skeletons = generateAllSheetPackSkeletons(data, 1, 1);
    // Both drawn — no nameMap, so dedup uses collector number keys (different)
    expect(skeletons[0]).toHaveLength(2);
  });

  it("legacy generateSheetPack deduplicates by name", () => {
    // Same name, different collector numbers on one sheet
    const sheet = makeSheet(1, [
      { set_code: "tst", collector_number: "1", weight: 1, is_foil: false },
      { set_code: "tst", collector_number: "300", weight: 1, is_foil: false },
    ]);
    const sheets = new Map<number, BoosterSheet>([[1, sheet]]);
    const configs: BoosterConfig[] = [
      { id: 1, weight: 1, slots: [{ sheet_id: 1, count: 2 }] },
    ];
    const data = makeProductData({ configs, sheets });

    // cardMap gives both the same name
    const cardMap = new Map<string, CardReference>([
      ["tst:1", makeCard("sf-1", { name: "Same Card" })],
      ["tst:300", makeCard("sf-300", { name: "Same Card" })],
    ]);

    vi.spyOn(Math, "random").mockReturnValue(0);
    const pack = generateSheetPack(data, cardMap);
    // Only 1 card — legacy API builds nameMap internally from cardMap
    expect(pack).toHaveLength(1);
  });
});
