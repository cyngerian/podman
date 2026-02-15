// ============================================================================
// podman Draft Engine — Pure, immutable core logic
// ============================================================================

import type {
  Draft,
  DraftFormat,
  DraftPick,
  DraftSeat,
  PacingMode,
  TimerPreset,
  CubeSource,
  CardReference,
  PackState,
  PassDirection,
  WinstonState,
  BasicLandCounts,
  ManaColor,
  Rarity,
} from "./types";

import { getPassDirection, MANA_COLORS } from "./types";

// ============================================================================
// Config
// ============================================================================

export interface CreateDraftConfig {
  id: string;
  groupId: string;
  hostId: string;
  format: DraftFormat;
  pacingMode: PacingMode;
  setCode?: string;
  setName?: string;
  cubeList?: string[];
  cubeSource?: CubeSource;
  deckBuildingEnabled?: boolean;
  pickHistoryPublic?: boolean;
  playerCount: number;
  packsPerPlayer?: number;
  cardsPerPack?: number;
  timerPreset?: TimerPreset;
  reviewPeriodSeconds?: number;
  asyncDeadlineMinutes?: number | null;
}

// ============================================================================
// Helpers
// ============================================================================

const RARITY_ORDER: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  mythic: 3,
};

function emptyBasicLands(): BasicLandCounts {
  return { W: 0, U: 0, B: 0, R: 0, G: 0 };
}

function emptySeat(position: number, userId: string, displayName: string): DraftSeat {
  return {
    position,
    userId,
    displayName,
    currentPack: null,
    picks: [],
    pool: [],
    deck: null,
    sideboard: null,
    queuedCardId: null,
    basicLands: emptyBasicLands(),
    hasSubmittedDeck: false,
    packQueue: [],
    packReceivedAt: null,
  };
}

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ============================================================================
// 1. Draft Factory
// ============================================================================

export function createDraft(config: CreateDraftConfig): Draft {
  if (config.playerCount < 2 || config.playerCount > 8) {
    throw new Error("playerCount must be between 2 and 8");
  }

  const defaultCardsPerPack = config.cardsPerPack ?? 14;

  return {
    id: config.id,
    groupId: config.groupId,
    hostId: config.hostId,
    format: config.format,
    pacingMode: config.pacingMode,
    status: "proposed",
    setCode: config.setCode ?? null,
    setName: config.setName ?? null,
    cubeList: config.cubeList ?? null,
    cubeSource: config.cubeSource ?? null,
    deckBuildingEnabled: config.deckBuildingEnabled ?? true,
    pickHistoryPublic: config.pickHistoryPublic ?? false,
    playerCount: config.playerCount,
    packsPerPlayer: config.packsPerPlayer ?? 3,
    cardsPerPack: defaultCardsPerPack,
    timerPreset: config.timerPreset ?? "competitive",
    reviewPeriodSeconds: config.reviewPeriodSeconds ?? 60,
    asyncDeadlineMinutes: config.asyncDeadlineMinutes ?? null,
    currentPack: 1,
    seats: [],
    winstonState: null,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
  };
}

// ============================================================================
// 2. Seat Management
// ============================================================================

export function addPlayer(draft: Draft, userId: string, displayName: string): Draft {
  if (draft.status !== "proposed" && draft.status !== "confirmed") {
    throw new Error(`Cannot add player in ${draft.status} status`);
  }
  if (draft.seats.length >= draft.playerCount) {
    throw new Error("Draft is full");
  }
  if (draft.seats.some((s) => s.userId === userId)) {
    throw new Error("Player is already in the draft");
  }

  const position = draft.seats.length;
  const seat = emptySeat(position, userId, displayName);

  return {
    ...draft,
    seats: [...draft.seats, seat],
  };
}

export function removePlayer(draft: Draft, userId: string): Draft {
  if (draft.status !== "proposed" && draft.status !== "confirmed") {
    throw new Error(`Cannot remove player in ${draft.status} status`);
  }

  const index = draft.seats.findIndex((s) => s.userId === userId);
  if (index === -1) {
    throw new Error("Player not found in draft");
  }

  // Rebuild seats with corrected positions
  const newSeats = draft.seats
    .filter((s) => s.userId !== userId)
    .map((s, i) => ({ ...s, position: i }));

  return {
    ...draft,
    seats: newSeats,
  };
}

// ============================================================================
// 3. Draft Lifecycle
// ============================================================================

export function confirmDraft(draft: Draft): Draft {
  if (draft.status !== "proposed") {
    throw new Error(`Cannot confirm draft in ${draft.status} status`);
  }

  const minPlayers = 2;
  if (draft.seats.length < minPlayers) {
    throw new Error(`Need at least ${minPlayers} players to confirm`);
  }

  return {
    ...draft,
    status: "confirmed",
  };
}

export function startDraft(draft: Draft, packs: CardReference[][]): Draft {
  if (draft.status !== "confirmed") {
    throw new Error(`Cannot start draft in ${draft.status} status`);
  }

  if (draft.format === "winston") {
    // For Winston, packs is a single flat pool — handled via initializeWinston
    return {
      ...draft,
      status: "active",
      startedAt: Date.now(),
    };
  }

  // Standard / Cube: packs array should have at least one pack per player (first round).
  // Remaining rounds are stored externally and passed via advanceToNextPack.
  const seatCount = draft.seats.length;
  if (packs.length < seatCount) {
    throw new Error(
      `Expected at least ${seatCount} packs (one per player), got ${packs.length}`
    );
  }

  // Distribute only the first round of packs. The caller retains remaining packs
  // and passes them via advanceToNextPack for subsequent rounds.
  const now = Date.now();
  const seatsWithFirstPack = draft.seats.map((seat, seatIdx) => {
    const packIndex = seatIdx; // First round: pack 0..N-1
    const firstPack: PackState = {
      id: `pack-${seatIdx}-0`,
      originSeat: seatIdx,
      cards: [...packs[packIndex]],
      pickNumber: 1,
      round: 1,
    };

    return {
      ...seat,
      currentPack: firstPack,
      packReceivedAt: now,
      packQueue: [],
    };
  });

  return {
    ...draft,
    status: "active",
    startedAt: now,
    currentPack: 1,
    seats: seatsWithFirstPack,
  };
}

export function transitionToDeckBuilding(draft: Draft): Draft {
  if (draft.status !== "active") {
    throw new Error(`Cannot transition to deck building from ${draft.status} status`);
  }

  if (!draft.deckBuildingEnabled) {
    return {
      ...draft,
      status: "complete",
      completedAt: Date.now(),
    };
  }

  // Initialize deck/sideboard from pool
  const newSeats = draft.seats.map((seat) => ({
    ...seat,
    deck: [...seat.pool],
    sideboard: [],
  }));

  return {
    ...draft,
    status: "deck_building",
    seats: newSeats,
  };
}

export function completeDraft(draft: Draft): Draft {
  if (draft.status !== "active" && draft.status !== "deck_building") {
    throw new Error(`Cannot complete draft from ${draft.status} status`);
  }

  return {
    ...draft,
    status: "complete",
    completedAt: Date.now(),
  };
}

// ============================================================================
// 4. Standard/Cube Draft Picking
// ============================================================================

export function makePick(
  draft: Draft,
  seatPosition: number,
  cardId: string
): Draft {
  if (draft.status !== "active") {
    throw new Error("Draft is not active");
  }

  const seat = draft.seats[seatPosition];
  if (!seat) {
    throw new Error(`Invalid seat position: ${seatPosition}`);
  }
  if (!seat.currentPack) {
    throw new Error(`Seat ${seatPosition} has no current pack`);
  }

  const cardIndex = seat.currentPack.cards.findIndex(
    (c) => c.scryfallId === cardId
  );
  if (cardIndex === -1) {
    throw new Error(`Card ${cardId} not found in current pack`);
  }

  const pickedCard = seat.currentPack.cards[cardIndex];
  const remainingCards = seat.currentPack.cards.filter(
    (_, i) => i !== cardIndex
  );

  // Determine pick timing
  const packNumber = draft.currentPack;
  const pickInPack = seat.currentPack.pickNumber;
  const overallPickNumber = seat.picks.length + 1;

  const pick: DraftPick = {
    pickNumber: overallPickNumber,
    packNumber,
    pickInPack,
    cardId: pickedCard.scryfallId,
    cardName: pickedCard.name,
    timestamp: Date.now(),
  };

  const updatedPack: PackState = {
    ...seat.currentPack,
    cards: remainingCards,
    pickNumber: seat.currentPack.pickNumber + 1,
  };

  const updatedSeat: DraftSeat = {
    ...seat,
    currentPack: remainingCards.length === 0 ? null : updatedPack,
    picks: [...seat.picks, pick],
    pool: [...seat.pool, pickedCard],
    queuedCardId: null, // clear queue after picking
  };

  const newSeats = draft.seats.map((s) =>
    s.position === seatPosition ? updatedSeat : s
  );

  return {
    ...draft,
    seats: newSeats,
  };
}

export function passCurrentPacks(draft: Draft): Draft {
  if (draft.status !== "active") {
    throw new Error("Draft is not active");
  }

  const direction = getPassDirection(draft.currentPack);
  const totalSeats = draft.seats.length;

  // Build a map of packs keyed by their destination seat
  const packDestinations = new Map<number, PackState>();

  for (const seat of draft.seats) {
    if (seat.currentPack && seat.currentPack.cards.length > 0) {
      const destSeat = getNextSeat(seat.position, direction, totalSeats);
      packDestinations.set(destSeat, seat.currentPack);
    }
  }

  const newSeats = draft.seats.map((seat) => {
    const incomingPack = packDestinations.get(seat.position) ?? null;
    return {
      ...seat,
      currentPack: incomingPack,
      queuedCardId: null, // clear queue when pack changes
    };
  });

  return {
    ...draft,
    seats: newSeats,
  };
}

export function allPlayersHavePicked(draft: Draft): boolean {
  // All seats have either:
  // 1. A currentPack with one fewer card than expected (they picked), or
  // 2. null currentPack (they picked the last card)
  //
  // We detect "has picked" by checking if the pack's pickNumber has advanced
  // compared to what it was when distributed. Simpler: every seat's currentPack
  // should have the same pickNumber (they all pick in sync). If a seat still
  // has a pack at the old pickNumber, they haven't picked yet.
  //
  // Simplest heuristic: after picking, the pack's pickNumber is incremented.
  // We check that all seats either have no pack or have packs at the same pickNumber.
  // But actually, after makePick, the pickNumber is incremented. So if all packs
  // have the same pickNumber, everyone has picked.
  //
  // Even simpler: we can check that no two seats have packs with different pickNumbers.
  // After a pick round, all seats should have had their pick made.
  //
  // The caller should track this. We provide a simple check:
  // all seats with a currentPack should have the same pickNumber,
  // and seats without a currentPack have completed their pack.

  const packsInPlay = draft.seats
    .map((s) => s.currentPack)
    .filter((p): p is PackState => p !== null);

  if (packsInPlay.length === 0) return true;

  // All packs should be at the same pickNumber
  const pickNumbers = new Set(packsInPlay.map((p) => p.pickNumber));
  if (pickNumbers.size !== 1) return false;

  // All seats should have a pack (if packs are still in play, every seat should have one)
  return packsInPlay.length === draft.seats.length;
}

export function isPackComplete(pack: PackState): boolean {
  return pack.cards.length === 0;
}

export function isRoundComplete(draft: Draft): boolean {
  return draft.seats.every((s) => s.currentPack === null);
}

export function advanceToNextPack(
  draft: Draft,
  nextPacks?: CardReference[][]
): Draft {
  if (draft.status !== "active") {
    throw new Error("Draft is not active");
  }

  const nextPackNumber = draft.currentPack + 1;
  if (nextPackNumber > draft.packsPerPlayer) {
    throw new Error("No more packs to advance to");
  }

  if (!nextPacks || nextPacks.length < draft.seats.length) {
    throw new Error(
      `Need ${draft.seats.length} packs for next round`
    );
  }

  const now = Date.now();
  const newSeats = [...draft.seats];
  for (let seatIdx = 0; seatIdx < newSeats.length; seatIdx++) {
    const newPack: PackState = {
      id: `pack-${seatIdx}-${nextPackNumber - 1}`,
      originSeat: seatIdx,
      cards: [...nextPacks[seatIdx]],
      pickNumber: 1,
      round: nextPackNumber,
    };
    newSeats[seatIdx] = deliverPack(newSeats[seatIdx], newPack, now);
  }

  return {
    ...draft,
    currentPack: nextPackNumber,
    seats: newSeats,
  };
}

export function getNextSeat(
  currentPosition: number,
  direction: PassDirection,
  totalSeats: number
): number {
  if (direction === "left") {
    return (currentPosition + 1) % totalSeats;
  }
  return (currentPosition - 1 + totalSeats) % totalSeats;
}

export function autoPickCard(
  cards: CardReference[],
  queuedCardId?: string | null
): CardReference {
  if (cards.length === 0) {
    throw new Error("Cannot auto-pick from empty card list");
  }

  // Use queued card if it's still in the pack
  if (queuedCardId) {
    const queued = cards.find((c) => c.scryfallId === queuedCardId);
    if (queued) return queued;
  }

  // Fallback: pick randomly among highest rarity
  const maxRarity = Math.max(...cards.map((c) => RARITY_ORDER[c.rarity]));
  const topRarityCards = cards.filter(
    (c) => RARITY_ORDER[c.rarity] === maxRarity
  );

  const randomIndex = Math.floor(Math.random() * topRarityCards.length);
  return topRarityCards[randomIndex];
}

/** Queue a card to be auto-picked if the timer expires */
export function queuePick(
  draft: Draft,
  seatPosition: number,
  cardId: string
): Draft {
  const seat = draft.seats[seatPosition];
  if (!seat) throw new Error(`Invalid seat position: ${seatPosition}`);

  // Verify the card is in the current pack
  if (
    !seat.currentPack ||
    !seat.currentPack.cards.some((c) => c.scryfallId === cardId)
  ) {
    throw new Error("Queued card is not in current pack");
  }

  const newSeats = draft.seats.map((s) =>
    s.position === seatPosition ? { ...s, queuedCardId: cardId } : s
  );

  return { ...draft, seats: newSeats };
}

/** Clear the queued pick (e.g. when a new pack arrives) */
export function clearQueuedPick(
  draft: Draft,
  seatPosition: number
): Draft {
  const newSeats = draft.seats.map((s) =>
    s.position === seatPosition ? { ...s, queuedCardId: null } : s
  );

  return { ...draft, seats: newSeats };
}

// ============================================================================
// 4b. Individual Pack Passing
// ============================================================================

/** Deliver a pack to a seat: set as currentPack if empty, else enqueue */
export function deliverPack(seat: DraftSeat, pack: PackState, now: number): DraftSeat {
  if (seat.currentPack === null) {
    return {
      ...seat,
      currentPack: pack,
      packReceivedAt: now,
    };
  }
  return {
    ...seat,
    packQueue: [...(seat.packQueue ?? []), pack],
  };
}

/** Promote the first queued pack to currentPack if seat has no current pack */
export function promoteFromQueue(seat: DraftSeat, now: number): DraftSeat {
  const queue = seat.packQueue ?? [];
  if (seat.currentPack !== null || queue.length === 0) return seat;
  const [next, ...rest] = queue;
  return {
    ...seat,
    currentPack: next,
    packReceivedAt: now,
    packQueue: rest,
    queuedCardId: null,
  };
}

/** Pick a card and immediately pass the pack to the next seat */
export function makePickAndPass(
  draft: Draft,
  seatPosition: number,
  cardId: string
): Draft {
  if (draft.status !== "active") {
    throw new Error("Draft is not active");
  }

  const seat = draft.seats[seatPosition];
  if (!seat) throw new Error(`Invalid seat position: ${seatPosition}`);
  if (!seat.currentPack) throw new Error(`Seat ${seatPosition} has no current pack`);

  const cardIndex = seat.currentPack.cards.findIndex(
    (c) => c.scryfallId === cardId
  );
  if (cardIndex === -1) {
    throw new Error(`Card ${cardId} not found in current pack`);
  }

  const pickedCard = seat.currentPack.cards[cardIndex];
  const remainingCards = seat.currentPack.cards.filter((_, i) => i !== cardIndex);

  const packNumber = seat.currentPack.round ?? draft.currentPack;
  const pickInPack = seat.currentPack.pickNumber;
  const overallPickNumber = seat.picks.length + 1;

  const pick: DraftPick = {
    pickNumber: overallPickNumber,
    packNumber,
    pickInPack,
    cardId: pickedCard.scryfallId,
    cardName: pickedCard.name,
    timestamp: Date.now(),
  };

  const now = Date.now();
  const direction = getPassDirection(packNumber);
  const totalSeats = draft.seats.length;

  // Build updated seats
  let newSeats = draft.seats.map((s) => {
    if (s.position !== seatPosition) return s;
    return {
      ...s,
      currentPack: null,
      picks: [...s.picks, pick],
      pool: [...s.pool, pickedCard],
      queuedCardId: null,
    };
  });

  // Pass remaining cards to next seat if any remain
  if (remainingCards.length > 0) {
    const updatedPack: PackState = {
      ...seat.currentPack,
      cards: remainingCards,
      pickNumber: seat.currentPack.pickNumber + 1,
    };
    const destPosition = getNextSeat(seatPosition, direction, totalSeats);
    newSeats = newSeats.map((s) => {
      if (s.position !== destPosition) return s;
      return deliverPack(s, updatedPack, now);
    });
  }

  // Promote from queue for the picker
  newSeats = newSeats.map((s) => {
    if (s.position !== seatPosition) return s;
    return promoteFromQueue(s, now);
  });

  return {
    ...draft,
    seats: newSeats,
  };
}

/** Check if all packs for the current round have been fully consumed */
export function isIndividualRoundComplete(draft: Draft): boolean {
  const currentRound = draft.currentPack;
  for (const seat of draft.seats) {
    // Check currentPack
    if (seat.currentPack && (seat.currentPack.round ?? currentRound) === currentRound) {
      return false;
    }
    // Check packQueue
    for (const pack of (seat.packQueue ?? [])) {
      if ((pack.round ?? currentRound) === currentRound) {
        return false;
      }
    }
  }
  return true;
}

/** Hydrate a seat with missing fields for backwards compatibility */
export function hydrateSeat(seat: DraftSeat): DraftSeat {
  return {
    ...seat,
    packQueue: seat.packQueue ?? [],
    packReceivedAt: seat.packReceivedAt ?? null,
  };
}

// ============================================================================
// 5. Winston Draft Picking
// ============================================================================

export function initializeWinston(
  draft: Draft,
  allCards: CardReference[]
): Draft {
  if (draft.format !== "winston") {
    throw new Error("initializeWinston only works for Winston drafts");
  }
  if (draft.seats.length !== 2) {
    throw new Error("Winston draft requires exactly 2 players");
  }

  const shuffled = shuffleArray(allCards);

  // Take first 3 cards for the 3 piles
  if (shuffled.length < 3) {
    throw new Error("Need at least 3 cards for Winston draft");
  }

  const piles: [CardReference[], CardReference[], CardReference[]] = [
    [shuffled[0]],
    [shuffled[1]],
    [shuffled[2]],
  ];
  const stack = shuffled.slice(3);

  const winstonState: WinstonState = {
    stack,
    piles,
    activePile: 0,
    activePlayerIndex: 0,
  };

  return {
    ...draft,
    winstonState,
  };
}

export function winstonLookAtPile(
  draft: Draft,
  pileIndex: number
): CardReference[] {
  if (!draft.winstonState) {
    throw new Error("No Winston state");
  }
  if (draft.winstonState.activePile !== pileIndex) {
    throw new Error(
      `Must look at pile ${draft.winstonState.activePile}, not ${pileIndex}`
    );
  }
  if (pileIndex < 0 || pileIndex > 2) {
    throw new Error("Pile index must be 0, 1, or 2");
  }

  return [...draft.winstonState.piles[pileIndex]];
}

export function winstonTakePile(draft: Draft): Draft {
  if (!draft.winstonState) {
    throw new Error("No Winston state");
  }

  const { stack, piles, activePile, activePlayerIndex } = draft.winstonState;

  if (activePile === null) {
    throw new Error("No active pile to take");
  }

  const takenCards = piles[activePile];
  const seatPosition = draft.seats[activePlayerIndex].position;

  // Update the seat's pool and picks
  const newSeats = draft.seats.map((seat) => {
    if (seat.position !== seatPosition) return seat;

    const newPicks: DraftPick[] = takenCards.map((card, i) => ({
      pickNumber: seat.picks.length + i + 1,
      packNumber: 1,
      pickInPack: seat.picks.length + i + 1,
      cardId: card.scryfallId,
      cardName: card.name,
      timestamp: Date.now(),
    }));

    return {
      ...seat,
      picks: [...seat.picks, ...newPicks],
      pool: [...seat.pool, ...takenCards],
    };
  });

  // Replace pile with 1 card from stack (if available)
  const newStack = [...stack];
  const newPiles: [CardReference[], CardReference[], CardReference[]] = [
    [...piles[0]],
    [...piles[1]],
    [...piles[2]],
  ];
  newPiles[activePile] = newStack.length > 0 ? [newStack.shift()!] : [];

  // Switch active player, reset active pile
  const nextPlayerIndex = activePlayerIndex === 0 ? 1 : 0;

  const newWinstonState: WinstonState = {
    stack: newStack,
    piles: newPiles,
    activePile: 0,
    activePlayerIndex: nextPlayerIndex,
  };

  return {
    ...draft,
    seats: newSeats,
    winstonState: newWinstonState,
  };
}

export function winstonPassPile(draft: Draft): Draft {
  if (!draft.winstonState) {
    throw new Error("No Winston state");
  }

  const { stack, piles, activePile, activePlayerIndex } = draft.winstonState;

  if (activePile === null) {
    throw new Error("No active pile");
  }

  const newStack = [...stack];
  const newPiles: [CardReference[], CardReference[], CardReference[]] = [
    [...piles[0]],
    [...piles[1]],
    [...piles[2]],
  ];

  // Add 1 card from stack to the current pile (if stack not empty)
  if (newStack.length > 0) {
    newPiles[activePile] = [...newPiles[activePile], newStack.shift()!];
  }

  // If this was the last pile (index 2), player must take top of stack blind
  if (activePile === 2) {
    const seatPosition = draft.seats[activePlayerIndex].position;

    let blindCard: CardReference | null = null;
    if (newStack.length > 0) {
      blindCard = newStack.shift()!;
    }

    const newSeats = draft.seats.map((seat) => {
      if (seat.position !== seatPosition || !blindCard) return seat;

      const newPick: DraftPick = {
        pickNumber: seat.picks.length + 1,
        packNumber: 1,
        pickInPack: seat.picks.length + 1,
        cardId: blindCard.scryfallId,
        cardName: blindCard.name,
        timestamp: Date.now(),
      };

      return {
        ...seat,
        picks: [...seat.picks, newPick],
        pool: [...seat.pool, blindCard],
      };
    });

    // Switch player, reset to pile 0
    const nextPlayerIndex = activePlayerIndex === 0 ? 1 : 0;

    return {
      ...draft,
      seats: newSeats,
      winstonState: {
        stack: newStack,
        piles: newPiles,
        activePile: 0,
        activePlayerIndex: nextPlayerIndex,
      },
    };
  }

  // Move to next pile
  return {
    ...draft,
    winstonState: {
      stack: newStack,
      piles: newPiles,
      activePile: activePile + 1,
      activePlayerIndex,
    },
  };
}

export function isWinstonComplete(draft: Draft): boolean {
  if (!draft.winstonState) return false;

  const { stack, piles } = draft.winstonState;
  return (
    stack.length === 0 &&
    piles[0].length === 0 &&
    piles[1].length === 0 &&
    piles[2].length === 0
  );
}

// ============================================================================
// 6. Deck Building
// ============================================================================

export function moveCardToDeck(
  draft: Draft,
  seatPosition: number,
  cardId: string
): Draft {
  if (draft.status !== "deck_building") {
    throw new Error("Draft is not in deck building phase");
  }

  const seat = draft.seats[seatPosition];
  if (!seat) throw new Error(`Invalid seat position: ${seatPosition}`);
  if (!seat.sideboard || !seat.deck) {
    throw new Error("Deck building not initialized for this seat");
  }

  const cardIndex = seat.sideboard.findIndex((c) => c.scryfallId === cardId);
  if (cardIndex === -1) {
    throw new Error(`Card ${cardId} not found in sideboard`);
  }

  const card = seat.sideboard[cardIndex];
  const newSideboard = seat.sideboard.filter((_, i) => i !== cardIndex);
  const newDeck = [...seat.deck, card];

  const newSeats = draft.seats.map((s) =>
    s.position === seatPosition
      ? { ...s, deck: newDeck, sideboard: newSideboard }
      : s
  );

  return { ...draft, seats: newSeats };
}

export function moveCardToSideboard(
  draft: Draft,
  seatPosition: number,
  cardId: string
): Draft {
  if (draft.status !== "deck_building") {
    throw new Error("Draft is not in deck building phase");
  }

  const seat = draft.seats[seatPosition];
  if (!seat) throw new Error(`Invalid seat position: ${seatPosition}`);
  if (!seat.deck || !seat.sideboard) {
    throw new Error("Deck building not initialized for this seat");
  }

  const cardIndex = seat.deck.findIndex((c) => c.scryfallId === cardId);
  if (cardIndex === -1) {
    throw new Error(`Card ${cardId} not found in deck`);
  }

  const card = seat.deck[cardIndex];
  const newDeck = seat.deck.filter((_, i) => i !== cardIndex);
  const newSideboard = [...seat.sideboard, card];

  const newSeats = draft.seats.map((s) =>
    s.position === seatPosition
      ? { ...s, deck: newDeck, sideboard: newSideboard }
      : s
  );

  return { ...draft, seats: newSeats };
}

export function setBasicLands(
  draft: Draft,
  seatPosition: number,
  lands: BasicLandCounts
): Draft {
  if (draft.status !== "deck_building") {
    throw new Error("Draft is not in deck building phase");
  }

  const seat = draft.seats[seatPosition];
  if (!seat) throw new Error(`Invalid seat position: ${seatPosition}`);

  const newSeats = draft.seats.map((s) =>
    s.position === seatPosition ? { ...s, basicLands: { ...lands } } : s
  );

  return { ...draft, seats: newSeats };
}

export function suggestLandCounts(pool: CardReference[]): BasicLandCounts {
  const colorCounts: Record<ManaColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };

  // Count color occurrences across all cards in pool
  for (const card of pool) {
    for (const color of card.colors) {
      if (MANA_COLORS.includes(color)) {
        colorCounts[color]++;
      }
    }
  }

  const totalSymbols = Object.values(colorCounts).reduce((a, b) => a + b, 0);

  if (totalSymbols === 0) {
    // No colors found — distribute evenly among WUBRG or just return zeros
    return { W: 4, U: 3, B: 4, R: 3, G: 3 };
  }

  const totalLands = 17;
  const lands: BasicLandCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };

  // Distribute proportionally
  let assigned = 0;
  const fractional: { color: ManaColor; frac: number }[] = [];

  for (const color of MANA_COLORS) {
    const exact = (colorCounts[color] / totalSymbols) * totalLands;
    const floored = Math.floor(exact);
    lands[color] = floored;
    assigned += floored;
    fractional.push({ color, frac: exact - floored });
  }

  // Distribute remaining lands to colors with highest fractional parts
  fractional.sort((a, b) => b.frac - a.frac);
  let remaining = totalLands - assigned;
  for (const { color } of fractional) {
    if (remaining <= 0) break;
    // Only add lands to colors actually present in the pool
    if (colorCounts[color] > 0) {
      lands[color]++;
      remaining--;
    }
  }

  return lands;
}

export function submitDeck(draft: Draft, seatPosition: number): Draft {
  if (draft.status !== "deck_building") {
    throw new Error("Draft is not in deck building phase");
  }

  const seat = draft.seats[seatPosition];
  if (!seat) throw new Error(`Invalid seat position: ${seatPosition}`);

  const newSeats = draft.seats.map((s) =>
    s.position === seatPosition ? { ...s, hasSubmittedDeck: true } : s
  );

  const updatedDraft: Draft = { ...draft, seats: newSeats };

  // If all seats have submitted, transition to complete
  const allSubmitted = newSeats.every((s) => s.hasSubmittedDeck);
  if (allSubmitted) {
    return {
      ...updatedDraft,
      status: "complete",
      completedAt: Date.now(),
    };
  }

  return updatedDraft;
}

export function unsubmitDeck(draft: Draft, seatPosition: number): Draft {
  if (draft.status !== "deck_building" && draft.status !== "complete") {
    throw new Error(`Cannot unsubmit deck in ${draft.status} status`);
  }

  const seat = draft.seats[seatPosition];
  if (!seat) throw new Error(`Invalid seat position: ${seatPosition}`);

  const newSeats = draft.seats.map((s) =>
    s.position === seatPosition ? { ...s, hasSubmittedDeck: false } : s
  );

  const updatedDraft: Draft = { ...draft, seats: newSeats };

  if (draft.status === "complete") {
    return {
      ...updatedDraft,
      status: "deck_building",
      completedAt: null,
    };
  }

  return updatedDraft;
}

export function isDeckValid(seat: DraftSeat): boolean {
  const deckCards = seat.deck ? seat.deck.length : 0;
  const totalBasicLands = Object.values(seat.basicLands).reduce(
    (a, b) => a + b,
    0
  );
  return deckCards + totalBasicLands >= 40;
}
