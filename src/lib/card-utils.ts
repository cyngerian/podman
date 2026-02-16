import type { CardReference } from "./types";

export function isCreature(card: CardReference): boolean {
  return card.typeLine?.toLowerCase().includes("creature") ?? false;
}

export function getBorderClass(colors: string[]): string {
  if (colors.length === 0) return "card-border-C";
  if (colors.length > 1) return "card-border-M";
  return `card-border-${colors[0]}`;
}

/** Canonical rarity ordering (highest first). Used for sort keys and display grouping. */
export const RARITY_RANK = ["mythic", "rare", "uncommon", "common"] as const;

export function rarityRank(rarity: string): number {
  const idx = RARITY_RANK.indexOf(rarity as (typeof RARITY_RANK)[number]);
  return idx === -1 ? RARITY_RANK.length : idx;
}
