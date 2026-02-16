import { describe, it, expect } from "vitest";
import { formatDeckListText, formatPoolText, formatCockatriceXml } from "../export";
import type { CardReference, BasicLandCounts } from "../types";

function makeCard(name: string, overrides?: Partial<CardReference>): CardReference {
  return {
    scryfallId: `test-${name}`,
    name,
    imageUri: "",
    smallImageUri: "",
    rarity: "common",
    colors: [],
    cmc: 0,
    isFoil: false,
    ...overrides,
  };
}

const noLands: BasicLandCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };

describe("formatDeckListText", () => {
  it("formats a basic deck with no sideboard or lands", () => {
    const deck = [makeCard("Lightning Bolt"), makeCard("Lightning Bolt"), makeCard("Mountain")];
    const result = formatDeckListText(deck, [], noLands);
    expect(result).toContain("// Main Deck");
    expect(result).toContain("2 Lightning Bolt");
    expect(result).toContain("1 Mountain");
    expect(result).not.toContain("// Sideboard");
  });

  it("includes basic lands in the main deck", () => {
    const deck = [makeCard("Lightning Bolt")];
    const lands: BasicLandCounts = { W: 0, U: 0, B: 0, R: 8, G: 0 };
    const result = formatDeckListText(deck, [], lands);
    expect(result).toContain("8 Mountain");
    expect(result).toContain("1 Lightning Bolt");
  });

  it("includes sideboard when present", () => {
    const deck = [makeCard("Lightning Bolt")];
    const side = [makeCard("Shock"), makeCard("Shock")];
    const result = formatDeckListText(deck, side, noLands);
    expect(result).toContain("// Sideboard");
    expect(result).toContain("2 Shock");
  });

  it("includes deck name when provided", () => {
    const deck = [makeCard("Lightning Bolt")];
    const result = formatDeckListText(deck, [], noLands, "My Red Deck");
    expect(result).toContain("// My Red Deck");
  });

  it("omits deck name line when not provided", () => {
    const deck = [makeCard("Lightning Bolt")];
    const result = formatDeckListText(deck, [], noLands);
    const lines = result.split("\n");
    expect(lines[0]).toBe("// Main Deck");
  });

  it("aggregates duplicate cards by name", () => {
    const deck = [makeCard("Opt"), makeCard("Opt"), makeCard("Opt")];
    const result = formatDeckListText(deck, [], noLands);
    expect(result).toContain("3 Opt");
  });

  it("combines basic lands with cards of the same name in deck", () => {
    const deck = [makeCard("Plains")];
    const lands: BasicLandCounts = { W: 5, U: 0, B: 0, R: 0, G: 0 };
    const result = formatDeckListText(deck, [], lands);
    expect(result).toContain("6 Plains");
  });
});

describe("formatPoolText", () => {
  it("formats a simple pool", () => {
    const pool = [makeCard("Opt"), makeCard("Opt"), makeCard("Lightning Bolt")];
    const result = formatPoolText(pool);
    expect(result).toContain("2 Opt");
    expect(result).toContain("1 Lightning Bolt");
  });

  it("returns empty string for empty pool", () => {
    const result = formatPoolText([]);
    expect(result).toBe("");
  });
});

describe("formatCockatriceXml", () => {
  it("produces valid XML structure", () => {
    const deck = [makeCard("Lightning Bolt")];
    const result = formatCockatriceXml(deck, [], noLands);
    expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(result).toContain("<cockatrice_deck");
    expect(result).toContain('<zone name="main">');
    expect(result).toContain('<zone name="side">');
    expect(result).toContain("</cockatrice_deck>");
  });

  it("includes cards in main zone", () => {
    const deck = [makeCard("Lightning Bolt"), makeCard("Lightning Bolt")];
    const result = formatCockatriceXml(deck, [], noLands);
    expect(result).toContain('number="2" name="Lightning Bolt"');
  });

  it("includes basic lands in main zone", () => {
    const deck = [makeCard("Opt")];
    const lands: BasicLandCounts = { W: 0, U: 4, B: 0, R: 0, G: 0 };
    const result = formatCockatriceXml(deck, [], lands);
    expect(result).toContain('name="Island"');
  });

  it("includes sideboard cards in side zone", () => {
    const deck = [makeCard("Opt")];
    const side = [makeCard("Negate")];
    const result = formatCockatriceXml(deck, side, noLands);
    expect(result).toContain('name="Negate"');
  });

  it("uses provided deck name", () => {
    const deck = [makeCard("Opt")];
    const result = formatCockatriceXml(deck, [], noLands, "Test Deck");
    expect(result).toContain("<deckname>Test Deck</deckname>");
  });

  it("defaults deck name to 'podman Draft'", () => {
    const deck = [makeCard("Opt")];
    const result = formatCockatriceXml(deck, [], noLands);
    expect(result).toContain("<deckname>podman Draft</deckname>");
  });

  it("escapes ampersands in card names", () => {
    const deck = [makeCard("Sword of Fire & Ice")];
    const result = formatCockatriceXml(deck, [], noLands);
    expect(result).toContain("Fire &amp; Ice");
  });

  it("escapes ampersands in deck names", () => {
    const deck = [makeCard("Opt")];
    const result = formatCockatriceXml(deck, [], noLands, "R&D Deck");
    expect(result).toContain("<deckname>R&amp;D Deck</deckname>");
  });
});
