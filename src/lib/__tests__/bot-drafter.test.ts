import { describe, it, expect, vi, afterEach } from "vitest";
import {
  botUserId,
  isBotUserId,
  botDisplayName,
  botPickCard,
  botWinstonDecision,
} from "../bot-drafter";
import type { CardReference, ManaColor, Rarity } from "../types";

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

function makeColoredCard(
  id: string,
  colors: ManaColor[],
  rarity: Rarity = "common",
  typeLine?: string
): CardReference {
  return makeCard(id, { colors, rarity, typeLine });
}

// === 1. Bot ID Helpers ===

describe("botUserId", () => {
  it("returns a zero-padded UUID for single-digit index", () => {
    expect(botUserId(1)).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("returns a zero-padded UUID for double-digit index", () => {
    expect(botUserId(10)).toBe("00000000-0000-0000-0000-000000000010");
  });

  it("returns a zero-padded UUID for index 0", () => {
    expect(botUserId(0)).toBe("00000000-0000-0000-0000-000000000000");
  });
});

describe("isBotUserId", () => {
  it("returns true for a bot user ID", () => {
    expect(isBotUserId(botUserId(3))).toBe(true);
  });

  it("returns false for a regular UUID", () => {
    expect(isBotUserId("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(false);
  });
});

describe("botDisplayName", () => {
  it("returns the first bot name for index 0", () => {
    expect(botDisplayName(0)).toBe("Jace");
  });

  it("wraps around for index beyond the name list", () => {
    expect(botDisplayName(10)).toBe("Jace"); // 10 names, wraps to 0
  });

  it("returns correct name for mid-range index", () => {
    expect(botDisplayName(2)).toBe("Chandra");
  });
});

// === 2. botPickCard — pre-commitment (pool < 4) ===

describe("botPickCard pre-commitment", () => {
  it("throws on empty pack", () => {
    expect(() => botPickCard([], [])).toThrow("Cannot pick from empty pack");
  });

  it("returns the only card from a single-card pack", () => {
    const card = makeCard("only");
    expect(botPickCard([card], [])).toBe(card);
  });

  it("picks mythic over common when pool is small", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const mythic = makeCard("m", { rarity: "mythic" });
    const common = makeCard("c", { rarity: "common" });
    const pick = botPickCard([common, mythic], []);
    expect(pick.rarity).toBe("mythic");
  });

  it("picks rare over uncommon when pool is small", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const rare = makeCard("r", { rarity: "rare" });
    const uncommon = makeCard("u", { rarity: "uncommon" });
    const pick = botPickCard([uncommon, rare], []);
    expect(pick.rarity).toBe("rare");
  });
});

// === 3. botPickCard — post-commitment (pool >= 4) ===

describe("botPickCard post-commitment", () => {
  it("penalizes off-color cards after commitment", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    // Build a pool that commits to W/U (4+ cards)
    const pool = [
      makeColoredCard("p1", ["W"]),
      makeColoredCard("p2", ["W"]),
      makeColoredCard("p3", ["U"]),
      makeColoredCard("p4", ["U"]),
    ];
    const onColor = makeCard("on", { rarity: "common", colors: ["W"] });
    const offColor = makeCard("off", { rarity: "rare", colors: ["R"] });
    const pick = botPickCard([offColor, onColor], pool);
    // On-color common (5) should beat off-color rare (30 * 0.1 = 3)
    expect(pick.scryfallId).toBe("on");
  });

  it("keeps colorless cards at full value after commitment", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const pool = [
      makeColoredCard("p1", ["W"]),
      makeColoredCard("p2", ["W"]),
      makeColoredCard("p3", ["U"]),
      makeColoredCard("p4", ["U"]),
    ];
    const colorless = makeCard("cl", { rarity: "rare", colors: [] });
    const offColor = makeCard("off", { rarity: "rare", colors: ["R"] });
    const pick = botPickCard([offColor, colorless], pool);
    // Colorless rare (30) should beat off-color rare (30 * 0.1 = 3)
    expect(pick.scryfallId).toBe("cl");
  });

  it("commits to 3 colors when third color is close to second", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    // Pool: 3W, 2U, 2B → B has 100% of U count, so 3-color commitment
    const pool = [
      makeColoredCard("p1", ["W"]),
      makeColoredCard("p2", ["W"]),
      makeColoredCard("p3", ["W"]),
      makeColoredCard("p4", ["U"]),
      makeColoredCard("p5", ["U"]),
      makeColoredCard("p6", ["B"]),
      makeColoredCard("p7", ["B"]),
    ];
    const blackCard = makeCard("b", { rarity: "common", colors: ["B"] });
    const redCard = makeCard("r", { rarity: "common", colors: ["R"] });
    const pick = botPickCard([redCard, blackCard], pool);
    // B is in commitment, R is not → B should be picked
    expect(pick.scryfallId).toBe("b");
  });
});

// === 4. Creature balance ===

describe("botPickCard creature balance", () => {
  it("gives bonus for creature when pool is creature-light", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    // Pool: all non-creatures, committed to W
    const pool = [
      makeColoredCard("p1", ["W"], "common", "Instant"),
      makeColoredCard("p2", ["W"], "common", "Sorcery"),
      makeColoredCard("p3", ["W"], "common", "Enchantment"),
      makeColoredCard("p4", ["W"], "common", "Instant"),
    ];
    const creature = makeCard("cr", {
      rarity: "common",
      colors: ["W"],
      typeLine: "Creature — Human",
    });
    const spell = makeCard("sp", {
      rarity: "common",
      colors: ["W"],
      typeLine: "Instant",
    });
    const pick = botPickCard([spell, creature], pool);
    // Both common + on-color (5), but creature gets 1.3x bonus (6.5 vs 5)
    expect(pick.scryfallId).toBe("cr");
  });

  it("gives bonus for non-creature when pool is creature-heavy", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const pool = [
      makeColoredCard("p1", ["W"], "common", "Creature — Human"),
      makeColoredCard("p2", ["W"], "common", "Creature — Elf"),
      makeColoredCard("p3", ["W"], "common", "Creature — Cat"),
      makeColoredCard("p4", ["W"], "common", "Creature — Bird"),
    ];
    const creature = makeCard("cr", {
      rarity: "common",
      colors: ["W"],
      typeLine: "Creature — Human",
    });
    const spell = makeCard("sp", {
      rarity: "common",
      colors: ["W"],
      typeLine: "Instant",
    });
    const pick = botPickCard([creature, spell], pool);
    // Both common + on-color (5), but spell gets 1.3x bonus (6.5 vs 5)
    expect(pick.scryfallId).toBe("sp");
  });
});

// === 5. Tiebreaker ===

describe("botPickCard tiebreaker", () => {
  it("selects among tied cards using Math.random", () => {
    // Two cards of equal score — pick depends on random tiebreaker
    const a = makeCard("a", { rarity: "common" });
    const b = makeCard("b", { rarity: "common" });
    // random=0 picks first tied, random=0.99 picks last tied
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(botPickCard([a, b], []).scryfallId).toBe("a");
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    expect(botPickCard([a, b], []).scryfallId).toBe("b");
  });
});

// === 6. botWinstonDecision ===

describe("botWinstonDecision", () => {
  it("passes on an empty pile", () => {
    expect(botWinstonDecision([], [], 0)).toBe("pass");
  });

  it("takes last pile (index 2) when avg score > 5", () => {
    // A rare card scores 30 in pre-commitment → avg 30 > 5
    const pile = [makeCard("r", { rarity: "rare" })];
    expect(botWinstonDecision(pile, [], 2)).toBe("take");
  });

  it("passes last pile when avg score <= 5", () => {
    // A common scores 5 → avg exactly 5, not > 5
    const pile = [makeCard("c", { rarity: "common" })];
    expect(botWinstonDecision(pile, [], 2)).toBe("pass");
  });

  it("takes early pile with 3+ cards and avg > 8", () => {
    // 3 uncommons: avg score = 15 > 8
    const pile = [
      makeCard("u1", { rarity: "uncommon" }),
      makeCard("u2", { rarity: "uncommon" }),
      makeCard("u3", { rarity: "uncommon" }),
    ];
    expect(botWinstonDecision(pile, [], 0)).toBe("take");
  });

  it("takes early pile with 2+ cards and avg > 15", () => {
    // 2 rares: avg score = 30 > 15
    const pile = [
      makeCard("r1", { rarity: "rare" }),
      makeCard("r2", { rarity: "rare" }),
    ];
    expect(botWinstonDecision(pile, [], 0)).toBe("take");
  });

  it("takes early pile with single card avg > 25", () => {
    // Single mythic: score = 40 > 25
    const pile = [makeCard("m1", { rarity: "mythic" })];
    expect(botWinstonDecision(pile, [], 0)).toBe("take");
  });

  it("passes early pile with low-value cards", () => {
    // Single common: score = 5 < 25
    const pile = [makeCard("c1", { rarity: "common" })];
    expect(botWinstonDecision(pile, [], 0)).toBe("pass");
  });
});
