// ============================================================================
// podman Core Data Model
// ============================================================================

// --- Enums & Constants ---

export type DraftFormat = "standard" | "winston" | "cube";
export type PacingMode = "realtime" | "async";
export type DraftStatus =
  | "proposed"
  | "confirmed"
  | "active"
  | "deck_building"
  | "complete";
export type TimerPreset = "relaxed" | "competitive" | "speed" | "none";
export type PackEra = "play_booster" | "draft_booster";
export type CubeSource = "text" | "cubecobra";
export type Rarity = "common" | "uncommon" | "rare" | "mythic";

export type ManaColor = "W" | "U" | "B" | "R" | "G";
export const MANA_COLORS: ManaColor[] = ["W", "U", "B", "R", "G"];

/** Pass direction: Pack 1 left, Pack 2 right, Pack 3 left */
export type PassDirection = "left" | "right";

export function getPassDirection(packNumber: number): PassDirection {
  return packNumber % 2 === 1 ? "left" : "right";
}

// --- Timer Schedule ---

/** Default timer in seconds based on number of cards remaining in pack */
export const DEFAULT_TIMER_SCHEDULE: Record<number, number> = {
  14: 40,
  13: 40,
  12: 30,
  11: 30,
  10: 25,
  9: 25,
  8: 20,
  7: 20,
  6: 10,
  5: 10,
  4: 5,
  3: 5,
  2: 5,
  1: 0, // Auto-pick
};

/** Timer multipliers for each preset */
export const TIMER_MULTIPLIERS: Record<TimerPreset, number> = {
  relaxed: 1.5,
  competitive: 1,
  speed: 0.5,
  none: Infinity,
};

export function getPickTimer(
  cardsRemaining: number,
  preset: TimerPreset
): number {
  if (preset === "none") return Infinity;
  const base = DEFAULT_TIMER_SCHEDULE[cardsRemaining] ?? 5;
  return Math.ceil(base * TIMER_MULTIPLIERS[preset]);
}

// --- Card Reference (minimal, references Scryfall) ---

export interface CardReference {
  scryfallId: string;
  name: string;
  imageUri: string; // normal-size image URL
  smallImageUri: string; // small-size for grid thumbnails
  rarity: Rarity;
  colors: ManaColor[];
  cmc: number;
  isFoil: boolean;
}

// --- Pack Generation ---

export interface PackSlot {
  position: number;
  name: string; // "common", "uncommon", "rare_mythic", "wildcard", "land"
  rarityPool: Rarity[];
  rarityWeights?: number[]; // e.g., [6, 1] for rare:mythic
  allowDuplicates: boolean;
  isFoil: boolean;
  specialPool?: string; // future: "bonus_sheet", "showcase", "the_list"
}

export interface PackTemplate {
  id: string;
  setCode: string | null; // null = default template
  era: PackEra;
  slots: PackSlot[];
}

// --- Draft Pick ---

export interface DraftPick {
  pickNumber: number; // overall pick number (1-42+)
  packNumber: number; // 1, 2, or 3
  pickInPack: number; // 1-14 or 1-15
  cardId: string; // Scryfall card ID
  cardName: string; // cached for display
  timestamp: number; // Unix ms
}

// --- Pack State ---

export interface PackState {
  id: string;
  originSeat: number; // which seat opened this pack
  cards: CardReference[];
  pickNumber: number; // which pick this pack is on (1-14)
}

// --- Draft Seat ---

export interface BasicLandCounts {
  W: number;
  U: number;
  B: number;
  R: number;
  G: number;
}

export interface DraftSeat {
  position: number; // 0-7, seat at the "table"
  userId: string;
  displayName: string;
  currentPack: PackState | null;
  picks: DraftPick[];
  pool: CardReference[]; // all picked cards
  deck: CardReference[] | null; // cards in final deck
  sideboard: CardReference[] | null; // remaining cards not in deck
  queuedCardId: string | null; // card to auto-pick if timer expires
  basicLands: BasicLandCounts;
  hasSubmittedDeck: boolean;
}

// --- Winston State ---

export interface WinstonState {
  stack: CardReference[];
  piles: [CardReference[], CardReference[], CardReference[]];
  activePile: number | null; // which pile is being examined (0-2)
  activePlayerIndex: number; // index into seats array (0 or 1)
}

// --- Draft ---

export interface Draft {
  id: string;
  groupId: string;
  hostId: string;
  format: DraftFormat;
  pacingMode: PacingMode;
  status: DraftStatus;

  // Configuration
  setCode: string | null;
  setName: string | null;
  cubeList: string[] | null; // card identifiers for Cube
  cubeSource: CubeSource | null;
  deckBuildingEnabled: boolean;
  pickHistoryPublic: boolean;
  playerCount: number; // 2-8
  packsPerPlayer: number; // usually 3
  cardsPerPack: number; // 14 for play boosters, 15 for draft boosters
  timerPreset: TimerPreset;
  reviewPeriodSeconds: number;
  asyncDeadlineMinutes: number | null;

  // State (during ACTIVE)
  currentPack: number; // 1, 2, or 3
  seats: DraftSeat[];
  winstonState: WinstonState | null; // only for Winston format

  // Results
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

// --- Export Formats ---

export type ExportFormat = "clipboard" | "cockatrice" | "plaintext";

// --- Scryfall API Types ---

export interface ScryfallCard {
  id: string;
  name: string;
  set: string;
  rarity: string;
  colors: string[];
  cmc: number;
  image_uris?: {
    small: string;
    normal: string;
    large: string;
  };
  card_faces?: Array<{
    name: string;
    image_uris?: {
      small: string;
      normal: string;
      large: string;
    };
  }>;
  booster: boolean;
}

export interface ScryfallSet {
  code: string;
  name: string;
  set_type: string;
  released_at: string;
  icon_svg_uri: string;
  digital: boolean;
}

export interface ScryfallSetsResponse {
  object: "list";
  data: ScryfallSet[];
}

export interface ScryfallSearchResponse {
  object: "list";
  total_cards: number;
  has_more: boolean;
  next_page?: string;
  data: ScryfallCard[];
}

// --- UI State Types ---

export type PickedCardSortMode = "draft_order" | "color" | "cmc" | "rarity";
export type PackFilterMode = "all" | ManaColor | "colorless" | "multicolor";
