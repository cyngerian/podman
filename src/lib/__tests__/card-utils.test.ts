import { describe, it, expect } from "vitest";
import { isCreature, getBorderClass, RARITY_RANK, rarityRank } from "../card-utils";
import type { CardReference } from "../types";

function makeCard(overrides?: Partial<CardReference>): CardReference {
  return {
    scryfallId: "test-id",
    name: "Test Card",
    imageUri: "",
    smallImageUri: "",
    rarity: "common",
    colors: [],
    cmc: 0,
    isFoil: false,
    ...overrides,
  };
}

// === 1. isCreature ===

describe("isCreature", () => {
  it("returns true for a creature typeLine", () => {
    expect(isCreature(makeCard({ typeLine: "Creature — Human Wizard" }))).toBe(true);
  });

  it("returns true for an artifact creature", () => {
    expect(isCreature(makeCard({ typeLine: "Artifact Creature — Golem" }))).toBe(true);
  });

  it("returns false for a non-creature typeLine", () => {
    expect(isCreature(makeCard({ typeLine: "Instant" }))).toBe(false);
  });

  it("returns false for an enchantment", () => {
    expect(isCreature(makeCard({ typeLine: "Enchantment — Aura" }))).toBe(false);
  });

  it("returns false when typeLine is undefined", () => {
    expect(isCreature(makeCard({ typeLine: undefined }))).toBe(false);
  });
});

// === 2. getBorderClass ===

describe("getBorderClass", () => {
  it("returns colorless class for empty colors array", () => {
    expect(getBorderClass([])).toBe("card-border-C");
  });

  it("returns mono-color class for single color", () => {
    expect(getBorderClass(["W"])).toBe("card-border-W");
  });

  it("returns mono-color class for each color identity", () => {
    expect(getBorderClass(["U"])).toBe("card-border-U");
    expect(getBorderClass(["B"])).toBe("card-border-B");
    expect(getBorderClass(["R"])).toBe("card-border-R");
    expect(getBorderClass(["G"])).toBe("card-border-G");
  });

  it("returns multi-color class for two or more colors", () => {
    expect(getBorderClass(["W", "U"])).toBe("card-border-M");
  });

  it("returns multi-color class for three colors", () => {
    expect(getBorderClass(["W", "U", "B"])).toBe("card-border-M");
  });
});

// === 3. RARITY_RANK ===

describe("RARITY_RANK", () => {
  it("has mythic first, then rare, uncommon, common", () => {
    expect(RARITY_RANK).toEqual(["mythic", "rare", "uncommon", "common"]);
  });
});

// === 4. rarityRank ===

describe("rarityRank", () => {
  it("returns 0 for mythic", () => {
    expect(rarityRank("mythic")).toBe(0);
  });

  it("returns 1 for rare", () => {
    expect(rarityRank("rare")).toBe(1);
  });

  it("returns 2 for uncommon", () => {
    expect(rarityRank("uncommon")).toBe(2);
  });

  it("returns 3 for common", () => {
    expect(rarityRank("common")).toBe(3);
  });

  it("returns RARITY_RANK.length for unknown rarity", () => {
    expect(rarityRank("special")).toBe(RARITY_RANK.length);
  });

  it("sorts cards correctly by rarityRank value", () => {
    const rarities = ["common", "mythic", "uncommon", "rare"];
    const sorted = [...rarities].sort((a, b) => rarityRank(a) - rarityRank(b));
    expect(sorted).toEqual(["mythic", "rare", "uncommon", "common"]);
  });
});
