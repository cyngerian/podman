// ============================================================================
// Bot Drafter — Heuristic-based card picking for simulated drafts
// ============================================================================

import type { CardReference, ManaColor, Rarity } from "./types";

// --- Constants ---

const BOT_USER_ID_PREFIX = "00000000-0000-0000-0000-0000000000";
const COLOR_COMMITMENT_THRESHOLD = 4; // picks before choosing colors
const CREATURE_TARGET_RATIO = 0.6; // ~60% creatures, 40% spells

const RARITY_SCORE: Record<Rarity, number> = {
  mythic: 40,
  rare: 30,
  uncommon: 15,
  common: 5,
};

const BOT_NAMES = [
  "Jace",
  "Liliana",
  "Chandra",
  "Nissa",
  "Gideon",
  "Ajani",
  "Teferi",
  "Vivien",
  "Sorin",
  "Elspeth",
];

// --- Bot ID Helpers ---

export function botUserId(botIndex: number): string {
  return `${BOT_USER_ID_PREFIX}${String(botIndex).padStart(2, "0")}`;
}

export function isBotUserId(userId: string): boolean {
  return userId.startsWith(BOT_USER_ID_PREFIX);
}

export function botDisplayName(botIndex: number): string {
  return BOT_NAMES[botIndex % BOT_NAMES.length] ?? `Bot ${botIndex}`;
}

// --- Color Analysis ---

function getPoolColorCounts(pool: CardReference[]): Map<ManaColor, number> {
  const counts = new Map<ManaColor, number>();
  for (const card of pool) {
    for (const color of card.colors) {
      counts.set(color, (counts.get(color) ?? 0) + 1);
    }
  }
  return counts;
}

function chooseCommittedColors(pool: CardReference[]): ManaColor[] {
  const counts = getPoolColorCounts(pool);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) return [];

  // Go 3-color if third color has at least 60% the count of second
  const numColors =
    sorted.length >= 3 && sorted[2][1] >= sorted[1][1] * 0.6
      ? 3
      : Math.min(2, sorted.length);

  return sorted.slice(0, numColors).map(([color]) => color);
}

// --- Card Evaluation Helpers ---

function isCreature(card: CardReference): boolean {
  if (!card.typeLine) return false;
  return card.typeLine.toLowerCase().includes("creature");
}

function cardMatchesColors(card: CardReference, colors: ManaColor[]): boolean {
  // Colorless cards always match
  if (card.colors.length === 0) return true;
  return card.colors.some((c) => colors.includes(c));
}

function creatureBalance(pool: CardReference[]): {
  creatures: number;
  nonCreatures: number;
} {
  let creatures = 0;
  let nonCreatures = 0;
  for (const card of pool) {
    if (isCreature(card)) creatures++;
    else nonCreatures++;
  }
  return { creatures, nonCreatures };
}

// --- Card Scoring ---

function scoreCard(
  card: CardReference,
  pool: CardReference[],
  committedColors: ManaColor[] | null
): number {
  let score = RARITY_SCORE[card.rarity] ?? 5;

  // Phase 1: No color commitment yet — rarity is the primary signal
  if (!committedColors) {
    return score;
  }

  // Phase 2: Color commitment active — penalize off-color heavily
  if (!cardMatchesColors(card, committedColors)) {
    score *= 0.1;
  }

  // Creature/non-creature balance adjustment
  const balance = creatureBalance(pool);
  const total = balance.creatures + balance.nonCreatures;
  if (total > 0) {
    const currentRatio = balance.creatures / total;
    if (isCreature(card) && currentRatio < CREATURE_TARGET_RATIO) {
      score *= 1.3; // Bonus for creature when under target
    } else if (!isCreature(card) && currentRatio > CREATURE_TARGET_RATIO) {
      score *= 1.3; // Bonus for spell when over-creatured
    }
  }

  return score;
}

// --- Main Bot Pick Function ---

export function botPickCard(
  pack: CardReference[],
  pool: CardReference[]
): CardReference {
  if (pack.length === 0) {
    throw new Error("Cannot pick from empty pack");
  }
  if (pack.length === 1) {
    return pack[0];
  }

  // Determine color commitment based on pool size
  const committedColors =
    pool.length >= COLOR_COMMITMENT_THRESHOLD
      ? chooseCommittedColors(pool)
      : null;

  // Score all cards
  const scored = pack.map((card) => ({
    card,
    score: scoreCard(card, pool, committedColors),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Pick randomly among cards within 95% of top score (tiebreaker)
  const topScore = scored[0].score;
  const tied = scored.filter((s) => s.score >= topScore * 0.95);
  const pick = tied[Math.floor(Math.random() * tied.length)];

  return pick.card;
}

// --- Winston Bot Decision ---

export function botWinstonDecision(
  pile: CardReference[],
  pool: CardReference[],
  pileIndex: number
): "take" | "pass" {
  if (pile.length === 0) return "pass";

  const committedColors =
    pool.length >= COLOR_COMMITMENT_THRESHOLD
      ? chooseCommittedColors(pool)
      : null;

  const totalScore = pile.reduce(
    (sum, card) => sum + scoreCard(card, pool, committedColors),
    0
  );
  const avgScore = totalScore / pile.length;

  // Last pile (index 2) — more willing to take since alternative is blind draw
  if (pileIndex === 2) {
    return avgScore > 5 ? "take" : "pass";
  }

  // Earlier piles — take if high value
  if (pile.length >= 3 && avgScore > 8) return "take";
  if (pile.length >= 2 && avgScore > 15) return "take";
  if (avgScore > 25) return "take";

  return "pass";
}
