import { describe, it, expect } from "vitest";
import type { CardReference, Draft, DraftSeat, PackState } from "../types";
import {
  createDraft,
  addPlayer,
  removePlayer,
  confirmDraft,
  startDraft,
  transitionToDeckBuilding,
  completeDraft,
  makePick,
  passCurrentPacks,
  allPlayersHavePicked,
  isPackComplete,
  isRoundComplete,
  advanceToNextPack,
  getNextSeat,
  autoPickCard,
  queuePick,
  clearQueuedPick,
  deliverPack,
  promoteFromQueue,
  makePickAndPass,
  isIndividualRoundComplete,
  hydrateSeat,
  initializeWinston,
  winstonLookAtPile,
  winstonTakePile,
  winstonPassPile,
  isWinstonComplete,
  moveCardToDeck,
  moveCardToSideboard,
  setBasicLands,
  suggestLandCounts,
  submitDeck,
  unsubmitDeck,
  isDeckValid,
  type CreateDraftConfig,
} from "../draft-engine";

// ============================================================================
// Test Fixtures
// ============================================================================

function makeCard(id: string, overrides?: Partial<CardReference>): CardReference {
  return {
    scryfallId: id,
    name: `Card ${id}`,
    imageUri: `https://cards.scryfall.io/normal/${id}.jpg`,
    smallImageUri: `https://cards.scryfall.io/small/${id}.jpg`,
    rarity: "common",
    colors: [],
    cmc: 2,
    isFoil: false,
    ...overrides,
  };
}

function makePack(count: number, startId = 0): CardReference[] {
  return Array.from({ length: count }, (_, i) => makeCard(`card-${startId + i}`));
}

const baseConfig: CreateDraftConfig = {
  id: "draft-1",
  groupId: "group-1",
  hostId: "host-1",
  format: "standard",
  pacingMode: "realtime",
  playerCount: 4,
};

function setupActiveDraft(playerCount = 4, cardsPerPack = 14): Draft {
  let draft = createDraft({ ...baseConfig, playerCount, cardsPerPack });
  for (let i = 0; i < playerCount; i++) {
    draft = addPlayer(draft, `player-${i}`, `Player ${i}`);
  }
  draft = confirmDraft(draft);
  const packs = Array.from({ length: playerCount }, (_, i) =>
    makePack(cardsPerPack, i * cardsPerPack)
  );
  draft = startDraft(draft, packs);
  return draft;
}

function setupDeckBuildingDraft(): Draft {
  let draft = setupActiveDraft(4, 3);
  // Each player picks all 3 cards from their pack
  for (let pick = 0; pick < 3; pick++) {
    for (let seat = 0; seat < 4; seat++) {
      const pack = draft.seats[seat].currentPack;
      if (pack && pack.cards.length > 0) {
        draft = makePick(draft, seat, pack.cards[0].scryfallId);
      }
    }
    if (!isRoundComplete(draft)) {
      draft = passCurrentPacks(draft);
    }
  }
  draft = transitionToDeckBuilding(draft);
  return draft;
}

// ============================================================================
// 1. Draft Factory
// ============================================================================

describe("createDraft", () => {
  it("creates a draft with default values", () => {
    const draft = createDraft(baseConfig);
    expect(draft.id).toBe("draft-1");
    expect(draft.status).toBe("proposed");
    expect(draft.playerCount).toBe(4);
    expect(draft.packsPerPlayer).toBe(3);
    expect(draft.cardsPerPack).toBe(14);
    expect(draft.timerPreset).toBe("competitive");
    expect(draft.deckBuildingEnabled).toBe(true);
    expect(draft.pickHistoryPublic).toBe(false);
    expect(draft.currentPack).toBe(1);
    expect(draft.seats).toEqual([]);
    expect(draft.winstonState).toBeNull();
    expect(draft.startedAt).toBeNull();
    expect(draft.completedAt).toBeNull();
  });

  it("respects custom config overrides", () => {
    const draft = createDraft({
      ...baseConfig,
      packsPerPlayer: 5,
      cardsPerPack: 15,
      timerPreset: "relaxed",
      deckBuildingEnabled: false,
      pickHistoryPublic: true,
    });
    expect(draft.packsPerPlayer).toBe(5);
    expect(draft.cardsPerPack).toBe(15);
    expect(draft.timerPreset).toBe("relaxed");
    expect(draft.deckBuildingEnabled).toBe(false);
    expect(draft.pickHistoryPublic).toBe(true);
  });

  it("rejects playerCount < 2", () => {
    expect(() => createDraft({ ...baseConfig, playerCount: 1 })).toThrow(
      "playerCount must be between 2 and 8"
    );
  });

  it("rejects playerCount > 8", () => {
    expect(() => createDraft({ ...baseConfig, playerCount: 9 })).toThrow(
      "playerCount must be between 2 and 8"
    );
  });
});

// ============================================================================
// 2. Seat Management
// ============================================================================

describe("addPlayer", () => {
  it("adds a player to the draft", () => {
    const draft = createDraft(baseConfig);
    const updated = addPlayer(draft, "user-1", "Alice");
    expect(updated.seats).toHaveLength(1);
    expect(updated.seats[0].userId).toBe("user-1");
    expect(updated.seats[0].displayName).toBe("Alice");
    expect(updated.seats[0].position).toBe(0);
    expect(updated.seats[0].currentPack).toBeNull();
    expect(updated.seats[0].picks).toEqual([]);
    expect(updated.seats[0].pool).toEqual([]);
  });

  it("assigns sequential positions", () => {
    let draft = createDraft(baseConfig);
    draft = addPlayer(draft, "user-1", "Alice");
    draft = addPlayer(draft, "user-2", "Bob");
    draft = addPlayer(draft, "user-3", "Carol");
    expect(draft.seats.map((s) => s.position)).toEqual([0, 1, 2]);
  });

  it("rejects adding to a full draft", () => {
    let draft = createDraft({ ...baseConfig, playerCount: 2 });
    draft = addPlayer(draft, "user-1", "Alice");
    draft = addPlayer(draft, "user-2", "Bob");
    expect(() => addPlayer(draft, "user-3", "Carol")).toThrow("Draft is full");
  });

  it("rejects duplicate player", () => {
    let draft = createDraft(baseConfig);
    draft = addPlayer(draft, "user-1", "Alice");
    expect(() => addPlayer(draft, "user-1", "Alice")).toThrow(
      "Player is already in the draft"
    );
  });

  it("rejects adding in active status", () => {
    const draft = setupActiveDraft();
    expect(() => addPlayer(draft, "new-user", "New")).toThrow(
      "Cannot add player in active status"
    );
  });
});

describe("removePlayer", () => {
  it("removes a player and reindexes positions", () => {
    let draft = createDraft(baseConfig);
    draft = addPlayer(draft, "user-1", "Alice");
    draft = addPlayer(draft, "user-2", "Bob");
    draft = addPlayer(draft, "user-3", "Carol");
    draft = removePlayer(draft, "user-2");
    expect(draft.seats).toHaveLength(2);
    expect(draft.seats[0].userId).toBe("user-1");
    expect(draft.seats[0].position).toBe(0);
    expect(draft.seats[1].userId).toBe("user-3");
    expect(draft.seats[1].position).toBe(1);
  });

  it("rejects removing unknown player", () => {
    const draft = createDraft(baseConfig);
    expect(() => removePlayer(draft, "nobody")).toThrow(
      "Player not found in draft"
    );
  });

  it("rejects removing in active status", () => {
    const draft = setupActiveDraft();
    expect(() => removePlayer(draft, "player-0")).toThrow(
      "Cannot remove player in active status"
    );
  });
});

// ============================================================================
// 3. Draft Lifecycle
// ============================================================================

describe("confirmDraft", () => {
  it("transitions proposed → confirmed", () => {
    let draft = createDraft(baseConfig);
    draft = addPlayer(draft, "user-1", "Alice");
    draft = addPlayer(draft, "user-2", "Bob");
    draft = confirmDraft(draft);
    expect(draft.status).toBe("confirmed");
  });

  it("rejects confirming with < 2 players", () => {
    let draft = createDraft(baseConfig);
    draft = addPlayer(draft, "user-1", "Alice");
    expect(() => confirmDraft(draft)).toThrow("Need at least 2 players");
  });

  it("rejects confirming non-proposed draft", () => {
    let draft = createDraft(baseConfig);
    draft = addPlayer(draft, "user-1", "Alice");
    draft = addPlayer(draft, "user-2", "Bob");
    draft = confirmDraft(draft);
    expect(() => confirmDraft(draft)).toThrow(
      "Cannot confirm draft in confirmed status"
    );
  });
});

describe("startDraft", () => {
  it("distributes first-round packs to all seats", () => {
    let draft = createDraft({ ...baseConfig, playerCount: 2 });
    draft = addPlayer(draft, "user-1", "Alice");
    draft = addPlayer(draft, "user-2", "Bob");
    draft = confirmDraft(draft);

    const packs = [makePack(14, 0), makePack(14, 100)];
    draft = startDraft(draft, packs);

    expect(draft.status).toBe("active");
    expect(draft.startedAt).not.toBeNull();
    expect(draft.seats[0].currentPack).not.toBeNull();
    expect(draft.seats[0].currentPack!.cards).toHaveLength(14);
    expect(draft.seats[1].currentPack).not.toBeNull();
    expect(draft.seats[1].currentPack!.cards).toHaveLength(14);
  });

  it("sets pack metadata correctly", () => {
    let draft = createDraft({ ...baseConfig, playerCount: 2 });
    draft = addPlayer(draft, "user-1", "Alice");
    draft = addPlayer(draft, "user-2", "Bob");
    draft = confirmDraft(draft);

    const packs = [makePack(14, 0), makePack(14, 100)];
    draft = startDraft(draft, packs);

    const pack = draft.seats[0].currentPack!;
    expect(pack.id).toBe("pack-0-0");
    expect(pack.originSeat).toBe(0);
    expect(pack.pickNumber).toBe(1);
    expect(pack.round).toBe(1);
  });

  it("rejects starting non-confirmed draft", () => {
    const draft = createDraft(baseConfig);
    expect(() => startDraft(draft, [])).toThrow(
      "Cannot start draft in proposed status"
    );
  });

  it("rejects insufficient packs", () => {
    let draft = createDraft({ ...baseConfig, playerCount: 4 });
    for (let i = 0; i < 4; i++) draft = addPlayer(draft, `p-${i}`, `P${i}`);
    draft = confirmDraft(draft);
    expect(() => startDraft(draft, [makePack(14)])).toThrow(
      "Expected at least 4 packs"
    );
  });

  it("handles Winston format (no pack distribution)", () => {
    let draft = createDraft({
      ...baseConfig,
      format: "winston",
      playerCount: 2,
    });
    draft = addPlayer(draft, "user-1", "Alice");
    draft = addPlayer(draft, "user-2", "Bob");
    draft = confirmDraft(draft);
    draft = startDraft(draft, []);
    expect(draft.status).toBe("active");
    expect(draft.seats[0].currentPack).toBeNull();
    expect(draft.seats[1].currentPack).toBeNull();
  });
});

describe("transitionToDeckBuilding", () => {
  it("initializes deck and sideboard from pool", () => {
    let draft = setupActiveDraft(2, 3);
    // Pick all cards
    for (let pick = 0; pick < 3; pick++) {
      for (let seat = 0; seat < 2; seat++) {
        const pack = draft.seats[seat].currentPack;
        if (pack && pack.cards.length > 0) {
          draft = makePick(draft, seat, pack.cards[0].scryfallId);
        }
      }
      if (!isRoundComplete(draft)) {
        draft = passCurrentPacks(draft);
      }
    }
    draft = transitionToDeckBuilding(draft);
    expect(draft.status).toBe("deck_building");
    for (const seat of draft.seats) {
      expect(seat.deck).not.toBeNull();
      expect(seat.sideboard).toEqual([]);
      expect(seat.deck!.length).toBe(seat.pool.length);
    }
  });

  it("skips to complete when deckBuildingEnabled is false", () => {
    let draft = createDraft({
      ...baseConfig,
      playerCount: 2,
      deckBuildingEnabled: false,
      cardsPerPack: 3,
    });
    draft = addPlayer(draft, "user-1", "Alice");
    draft = addPlayer(draft, "user-2", "Bob");
    draft = confirmDraft(draft);
    draft = startDraft(draft, [makePack(3, 0), makePack(3, 100)]);
    // Pick all cards
    for (let seat = 0; seat < 2; seat++) {
      const pack = draft.seats[seat].currentPack;
      if (pack) draft = makePick(draft, seat, pack.cards[0].scryfallId);
    }
    draft = transitionToDeckBuilding(draft);
    expect(draft.status).toBe("complete");
    expect(draft.completedAt).not.toBeNull();
  });

  it("rejects when not active", () => {
    const draft = createDraft(baseConfig);
    expect(() => transitionToDeckBuilding(draft)).toThrow(
      "Cannot transition to deck building from proposed status"
    );
  });
});

describe("completeDraft", () => {
  it("completes an active draft", () => {
    const draft = setupActiveDraft();
    const completed = completeDraft(draft);
    expect(completed.status).toBe("complete");
    expect(completed.completedAt).not.toBeNull();
  });

  it("completes a deck_building draft", () => {
    const draft = setupDeckBuildingDraft();
    const completed = completeDraft(draft);
    expect(completed.status).toBe("complete");
  });

  it("rejects completing a proposed draft", () => {
    const draft = createDraft(baseConfig);
    expect(() => completeDraft(draft)).toThrow(
      "Cannot complete draft from proposed status"
    );
  });
});

// ============================================================================
// 4. Standard Draft Picking
// ============================================================================

describe("makePick", () => {
  it("picks a card from the current pack", () => {
    const draft = setupActiveDraft();
    const cardId = draft.seats[0].currentPack!.cards[0].scryfallId;
    const updated = makePick(draft, 0, cardId);

    expect(updated.seats[0].picks).toHaveLength(1);
    expect(updated.seats[0].picks[0].cardId).toBe(cardId);
    expect(updated.seats[0].pool).toHaveLength(1);
    expect(updated.seats[0].pool[0].scryfallId).toBe(cardId);
    expect(updated.seats[0].currentPack!.cards).toHaveLength(13);
  });

  it("records correct pick metadata", () => {
    const draft = setupActiveDraft();
    const cardId = draft.seats[0].currentPack!.cards[0].scryfallId;
    const updated = makePick(draft, 0, cardId);

    const pick = updated.seats[0].picks[0];
    expect(pick.pickNumber).toBe(1);
    expect(pick.packNumber).toBe(1);
    expect(pick.pickInPack).toBe(1);
    expect(pick.timestamp).toBeGreaterThan(0);
  });

  it("clears queued card after picking", () => {
    let draft = setupActiveDraft();
    const cards = draft.seats[0].currentPack!.cards;
    draft = queuePick(draft, 0, cards[1].scryfallId);
    draft = makePick(draft, 0, cards[0].scryfallId);
    expect(draft.seats[0].queuedCardId).toBeNull();
  });

  it("nulls currentPack when picking the last card", () => {
    let draft = setupActiveDraft(2, 1);
    const cardId = draft.seats[0].currentPack!.cards[0].scryfallId;
    draft = makePick(draft, 0, cardId);
    expect(draft.seats[0].currentPack).toBeNull();
  });

  it("rejects pick from inactive draft", () => {
    const draft = createDraft(baseConfig);
    expect(() => makePick(draft, 0, "card-0")).toThrow("Draft is not active");
  });

  it("rejects pick of card not in pack", () => {
    const draft = setupActiveDraft();
    expect(() => makePick(draft, 0, "nonexistent")).toThrow(
      "Card nonexistent not found in current pack"
    );
  });

  it("rejects pick from seat with no pack", () => {
    let draft = setupActiveDraft(2, 1);
    // Pick the only card so currentPack becomes null
    draft = makePick(draft, 0, draft.seats[0].currentPack!.cards[0].scryfallId);
    expect(() => makePick(draft, 0, "anything")).toThrow(
      "Seat 0 has no current pack"
    );
  });

  it("does not mutate the original draft", () => {
    const draft = setupActiveDraft();
    const originalPool = draft.seats[0].pool;
    const cardId = draft.seats[0].currentPack!.cards[0].scryfallId;
    makePick(draft, 0, cardId);
    expect(draft.seats[0].pool).toBe(originalPool);
    expect(draft.seats[0].pool).toHaveLength(0);
  });
});

describe("passCurrentPacks", () => {
  it("passes packs left in pack 1", () => {
    let draft = setupActiveDraft();
    // All players pick
    for (let i = 0; i < 4; i++) {
      draft = makePick(draft, i, draft.seats[i].currentPack!.cards[0].scryfallId);
    }
    // Seat 0 had pack from origin 0. After passing left, seat 1 should get it.
    const originBefore = draft.seats[0].currentPack!.originSeat;
    draft = passCurrentPacks(draft);
    expect(draft.seats[1].currentPack!.originSeat).toBe(originBefore);
  });

  it("clears queued picks on pass", () => {
    let draft = setupActiveDraft();
    draft = queuePick(draft, 1, draft.seats[1].currentPack!.cards[2].scryfallId);
    for (let i = 0; i < 4; i++) {
      draft = makePick(draft, i, draft.seats[i].currentPack!.cards[0].scryfallId);
    }
    draft = passCurrentPacks(draft);
    expect(draft.seats[1].queuedCardId).toBeNull();
  });
});

describe("allPlayersHavePicked", () => {
  it("returns true when all have picked (same pickNumber)", () => {
    let draft = setupActiveDraft();
    for (let i = 0; i < 4; i++) {
      draft = makePick(draft, i, draft.seats[i].currentPack!.cards[0].scryfallId);
    }
    expect(allPlayersHavePicked(draft)).toBe(true);
  });

  it("returns false when one player hasn't picked", () => {
    let draft = setupActiveDraft();
    draft = makePick(draft, 0, draft.seats[0].currentPack!.cards[0].scryfallId);
    expect(allPlayersHavePicked(draft)).toBe(false);
  });

  it("returns true when no packs in play", () => {
    let draft = setupActiveDraft(2, 1);
    for (let i = 0; i < 2; i++) {
      draft = makePick(draft, i, draft.seats[i].currentPack!.cards[0].scryfallId);
    }
    expect(allPlayersHavePicked(draft)).toBe(true);
  });
});

describe("isPackComplete / isRoundComplete", () => {
  it("isPackComplete returns true for empty pack", () => {
    const pack: PackState = {
      id: "test",
      originSeat: 0,
      cards: [],
      pickNumber: 15,
      round: 1,
    };
    expect(isPackComplete(pack)).toBe(true);
  });

  it("isPackComplete returns false for non-empty pack", () => {
    const pack: PackState = {
      id: "test",
      originSeat: 0,
      cards: [makeCard("c1")],
      pickNumber: 1,
      round: 1,
    };
    expect(isPackComplete(pack)).toBe(false);
  });

  it("isRoundComplete returns true when all seats have no pack", () => {
    let draft = setupActiveDraft(2, 1);
    for (let i = 0; i < 2; i++) {
      draft = makePick(draft, i, draft.seats[i].currentPack!.cards[0].scryfallId);
    }
    expect(isRoundComplete(draft)).toBe(true);
  });

  it("isRoundComplete returns false when any seat has a pack", () => {
    const draft = setupActiveDraft();
    expect(isRoundComplete(draft)).toBe(false);
  });
});

describe("advanceToNextPack", () => {
  it("distributes next round of packs", () => {
    let draft = setupActiveDraft(2, 1);
    // Pick the only card in round 1
    for (let i = 0; i < 2; i++) {
      draft = makePick(draft, i, draft.seats[i].currentPack!.cards[0].scryfallId);
    }
    expect(isRoundComplete(draft)).toBe(true);

    const nextPacks = [makePack(1, 200), makePack(1, 300)];
    draft = advanceToNextPack(draft, nextPacks);
    expect(draft.currentPack).toBe(2);
    expect(draft.seats[0].currentPack).not.toBeNull();
    expect(draft.seats[1].currentPack).not.toBeNull();
  });

  it("rejects when no more packs", () => {
    let draft = createDraft({
      ...baseConfig,
      playerCount: 2,
      packsPerPlayer: 1,
      cardsPerPack: 1,
    });
    draft = addPlayer(draft, "p1", "P1");
    draft = addPlayer(draft, "p2", "P2");
    draft = confirmDraft(draft);
    draft = startDraft(draft, [makePack(1, 0), makePack(1, 100)]);
    for (let i = 0; i < 2; i++) {
      draft = makePick(draft, i, draft.seats[i].currentPack!.cards[0].scryfallId);
    }
    expect(() => advanceToNextPack(draft, [])).toThrow("No more packs");
  });

  it("rejects when not enough packs provided", () => {
    let draft = setupActiveDraft(2, 1);
    for (let i = 0; i < 2; i++) {
      draft = makePick(draft, i, draft.seats[i].currentPack!.cards[0].scryfallId);
    }
    expect(() => advanceToNextPack(draft, [makePack(1)])).toThrow(
      "Need 2 packs"
    );
  });
});

describe("getNextSeat", () => {
  it("wraps left correctly", () => {
    expect(getNextSeat(3, "left", 4)).toBe(0);
    expect(getNextSeat(0, "left", 4)).toBe(1);
    expect(getNextSeat(2, "left", 4)).toBe(3);
  });

  it("wraps right correctly", () => {
    expect(getNextSeat(0, "right", 4)).toBe(3);
    expect(getNextSeat(3, "right", 4)).toBe(2);
    expect(getNextSeat(1, "right", 4)).toBe(0);
  });
});

describe("autoPickCard", () => {
  it("picks the queued card if still in pack", () => {
    const cards = [
      makeCard("c1", { rarity: "common" }),
      makeCard("c2", { rarity: "rare" }),
    ];
    expect(autoPickCard(cards, "c1").scryfallId).toBe("c1");
  });

  it("falls back to highest rarity when queued card is gone", () => {
    const cards = [
      makeCard("c1", { rarity: "common" }),
      makeCard("c2", { rarity: "mythic" }),
    ];
    expect(autoPickCard(cards, "gone").scryfallId).toBe("c2");
  });

  it("picks highest rarity when no queue", () => {
    const cards = [
      makeCard("c1", { rarity: "uncommon" }),
      makeCard("c2", { rarity: "rare" }),
      makeCard("c3", { rarity: "common" }),
    ];
    expect(autoPickCard(cards).scryfallId).toBe("c2");
  });

  it("throws on empty card list", () => {
    expect(() => autoPickCard([])).toThrow("Cannot auto-pick from empty");
  });
});

describe("queuePick / clearQueuedPick", () => {
  it("queues a card", () => {
    const draft = setupActiveDraft();
    const cardId = draft.seats[0].currentPack!.cards[2].scryfallId;
    const updated = queuePick(draft, 0, cardId);
    expect(updated.seats[0].queuedCardId).toBe(cardId);
  });

  it("rejects queuing a card not in pack", () => {
    const draft = setupActiveDraft();
    expect(() => queuePick(draft, 0, "fake-card")).toThrow(
      "Queued card is not in current pack"
    );
  });

  it("clears the queue", () => {
    let draft = setupActiveDraft();
    const cardId = draft.seats[0].currentPack!.cards[2].scryfallId;
    draft = queuePick(draft, 0, cardId);
    draft = clearQueuedPick(draft, 0);
    expect(draft.seats[0].queuedCardId).toBeNull();
  });
});

// ============================================================================
// 4b. Individual Pack Passing (makePickAndPass)
// ============================================================================

describe("deliverPack / promoteFromQueue", () => {
  it("delivers pack to empty seat as currentPack", () => {
    const seat: DraftSeat = {
      position: 0,
      userId: "u1",
      displayName: "P1",
      currentPack: null,
      picks: [],
      pool: [],
      deck: null,
      sideboard: null,
      queuedCardId: null,
      basicLands: { W: 0, U: 0, B: 0, R: 0, G: 0 },
      hasSubmittedDeck: false,
      packQueue: [],
      packReceivedAt: null,
    };
    const pack: PackState = {
      id: "p1",
      originSeat: 1,
      cards: [makeCard("c1")],
      pickNumber: 1,
      round: 1,
    };
    const updated = deliverPack(seat, pack, 1000);
    expect(updated.currentPack).toBe(pack);
    expect(updated.packReceivedAt).toBe(1000);
  });

  it("enqueues pack when seat already has a pack", () => {
    const existingPack: PackState = {
      id: "existing",
      originSeat: 0,
      cards: [makeCard("c0")],
      pickNumber: 1,
      round: 1,
    };
    const seat: DraftSeat = {
      position: 0,
      userId: "u1",
      displayName: "P1",
      currentPack: existingPack,
      picks: [],
      pool: [],
      deck: null,
      sideboard: null,
      queuedCardId: null,
      basicLands: { W: 0, U: 0, B: 0, R: 0, G: 0 },
      hasSubmittedDeck: false,
      packQueue: [],
      packReceivedAt: 500,
    };
    const newPack: PackState = {
      id: "new",
      originSeat: 2,
      cards: [makeCard("c2")],
      pickNumber: 1,
      round: 1,
    };
    const updated = deliverPack(seat, newPack, 1000);
    expect(updated.currentPack).toBe(existingPack);
    expect(updated.packQueue).toHaveLength(1);
    expect(updated.packQueue[0]).toBe(newPack);
  });

  it("promotes from queue when currentPack is null", () => {
    const queuedPack: PackState = {
      id: "q1",
      originSeat: 3,
      cards: [makeCard("c3")],
      pickNumber: 2,
      round: 1,
    };
    const seat: DraftSeat = {
      position: 0,
      userId: "u1",
      displayName: "P1",
      currentPack: null,
      picks: [],
      pool: [],
      deck: null,
      sideboard: null,
      queuedCardId: null,
      basicLands: { W: 0, U: 0, B: 0, R: 0, G: 0 },
      hasSubmittedDeck: false,
      packQueue: [queuedPack],
      packReceivedAt: null,
    };
    const updated = promoteFromQueue(seat, 2000);
    expect(updated.currentPack).toBe(queuedPack);
    expect(updated.packReceivedAt).toBe(2000);
    expect(updated.packQueue).toEqual([]);
    expect(updated.queuedCardId).toBeNull();
  });

  it("promoteFromQueue is a no-op when currentPack exists", () => {
    const pack: PackState = {
      id: "p1",
      originSeat: 0,
      cards: [makeCard("c1")],
      pickNumber: 1,
      round: 1,
    };
    const seat: DraftSeat = {
      position: 0,
      userId: "u1",
      displayName: "P1",
      currentPack: pack,
      picks: [],
      pool: [],
      deck: null,
      sideboard: null,
      queuedCardId: null,
      basicLands: { W: 0, U: 0, B: 0, R: 0, G: 0 },
      hasSubmittedDeck: false,
      packQueue: [],
      packReceivedAt: 500,
    };
    const updated = promoteFromQueue(seat, 2000);
    expect(updated).toBe(seat); // same reference, no change
  });
});

describe("makePickAndPass", () => {
  it("picks, passes pack, and promotes from queue", () => {
    const draft = setupActiveDraft(4, 3);
    const cardId = draft.seats[0].currentPack!.cards[0].scryfallId;
    const updated = makePickAndPass(draft, 0, cardId);

    // Seat 0 picked and has no current pack (or promoted from queue)
    expect(updated.seats[0].picks).toHaveLength(1);
    expect(updated.seats[0].pool).toHaveLength(1);

    // Seat 1 (next left) should have received the passed pack
    // It might be in currentPack or queue depending on whether seat 1 already had a pack
    const seat1 = updated.seats[1];
    const seat1HasPassedPack =
      seat1.currentPack?.originSeat === 0 ||
      seat1.packQueue.some((p) => p.originSeat === 0);
    expect(seat1HasPassedPack).toBe(true);
  });

  it("does not pass an empty pack", () => {
    let draft = setupActiveDraft(2, 1);
    const cardId = draft.seats[0].currentPack!.cards[0].scryfallId;
    draft = makePickAndPass(draft, 0, cardId);
    // Only 1 card in pack, so nothing to pass
    expect(draft.seats[1].packQueue).toHaveLength(0);
  });
});

describe("isIndividualRoundComplete", () => {
  it("returns true when no packs from current round remain", () => {
    let draft = setupActiveDraft(2, 1);
    for (let i = 0; i < 2; i++) {
      draft = makePickAndPass(draft, i, draft.seats[i].currentPack!.cards[0].scryfallId);
    }
    expect(isIndividualRoundComplete(draft)).toBe(true);
  });
});

describe("hydrateSeat", () => {
  it("fills in missing packQueue and packReceivedAt", () => {
    const seat = {
      position: 0,
      userId: "u1",
      displayName: "P1",
      currentPack: null,
      picks: [],
      pool: [],
      deck: null,
      sideboard: null,
      queuedCardId: null,
      basicLands: { W: 0, U: 0, B: 0, R: 0, G: 0 },
      hasSubmittedDeck: false,
    } as unknown as DraftSeat;

    const hydrated = hydrateSeat(seat);
    expect(hydrated.packQueue).toEqual([]);
    expect(hydrated.packReceivedAt).toBeNull();
  });
});

// ============================================================================
// 5. Winston Draft
// ============================================================================

describe("Winston draft", () => {
  function setupWinstonDraft(): Draft {
    let draft = createDraft({
      ...baseConfig,
      format: "winston",
      playerCount: 2,
    });
    draft = addPlayer(draft, "user-1", "Alice");
    draft = addPlayer(draft, "user-2", "Bob");
    draft = confirmDraft(draft);
    draft = startDraft(draft, []);

    const cards = makePack(20, 0);
    draft = initializeWinston(draft, cards);
    return draft;
  }

  describe("initializeWinston", () => {
    it("sets up 3 piles with 1 card each and remaining as stack", () => {
      const draft = setupWinstonDraft();
      expect(draft.winstonState).not.toBeNull();
      expect(draft.winstonState!.piles[0]).toHaveLength(1);
      expect(draft.winstonState!.piles[1]).toHaveLength(1);
      expect(draft.winstonState!.piles[2]).toHaveLength(1);
      expect(draft.winstonState!.stack).toHaveLength(17); // 20 - 3
      expect(draft.winstonState!.activePile).toBe(0);
      expect(draft.winstonState!.activePlayerIndex).toBe(0);
    });

    it("rejects non-winston format", () => {
      const draft = setupActiveDraft();
      expect(() => initializeWinston(draft, makePack(20))).toThrow(
        "initializeWinston only works for Winston drafts"
      );
    });

    it("rejects < 3 cards", () => {
      let draft = createDraft({
        ...baseConfig,
        format: "winston",
        playerCount: 2,
      });
      draft = addPlayer(draft, "user-1", "Alice");
      draft = addPlayer(draft, "user-2", "Bob");
      draft = confirmDraft(draft);
      draft = startDraft(draft, []);
      expect(() => initializeWinston(draft, makePack(2))).toThrow(
        "Need at least 3 cards"
      );
    });
  });

  describe("winstonLookAtPile", () => {
    it("returns cards in the active pile", () => {
      const draft = setupWinstonDraft();
      const cards = winstonLookAtPile(draft, 0);
      expect(cards).toHaveLength(1);
    });

    it("rejects looking at wrong pile", () => {
      const draft = setupWinstonDraft();
      expect(() => winstonLookAtPile(draft, 1)).toThrow(
        "Must look at pile 0, not 1"
      );
    });
  });

  describe("winstonTakePile", () => {
    it("takes pile, adds to pool, refills from stack, switches player", () => {
      const draft = setupWinstonDraft();
      const updated = winstonTakePile(draft);

      // Player 0 took pile 0 (1 card)
      expect(updated.seats[0].pool).toHaveLength(1);
      expect(updated.seats[0].picks).toHaveLength(1);

      // Pile refilled with 1 card from stack
      expect(updated.winstonState!.piles[0]).toHaveLength(1);
      expect(updated.winstonState!.stack).toHaveLength(16);

      // Switched to player 1
      expect(updated.winstonState!.activePlayerIndex).toBe(1);
      expect(updated.winstonState!.activePile).toBe(0);
    });
  });

  describe("winstonPassPile", () => {
    it("adds card to pile and advances to next pile", () => {
      const draft = setupWinstonDraft();
      const updated = winstonPassPile(draft);

      // Pile 0 grew by 1 card from stack
      expect(updated.winstonState!.piles[0]).toHaveLength(2);
      expect(updated.winstonState!.stack).toHaveLength(16);
      expect(updated.winstonState!.activePile).toBe(1);
      // Same player
      expect(updated.winstonState!.activePlayerIndex).toBe(0);
    });

    it("blind draws from stack after passing all 3 piles", () => {
      let draft = setupWinstonDraft();
      // Pass piles 0, 1, 2
      draft = winstonPassPile(draft); // pass pile 0, advance to 1
      draft = winstonPassPile(draft); // pass pile 1, advance to 2
      draft = winstonPassPile(draft); // pass pile 2, blind draw

      // Player 0 got 1 card (blind draw)
      expect(draft.seats[0].pool).toHaveLength(1);
      expect(draft.seats[0].picks).toHaveLength(1);

      // Switched to player 1
      expect(draft.winstonState!.activePlayerIndex).toBe(1);
      expect(draft.winstonState!.activePile).toBe(0);
    });
  });

  describe("isWinstonComplete", () => {
    it("returns false when cards remain", () => {
      const draft = setupWinstonDraft();
      expect(isWinstonComplete(draft)).toBe(false);
    });

    it("returns true when stack and all piles are empty", () => {
      const draft = setupWinstonDraft();
      // Manually clear everything
      const completed: Draft = {
        ...draft,
        winstonState: {
          stack: [],
          piles: [[], [], []],
          activePile: 0,
          activePlayerIndex: 0,
        },
      };
      expect(isWinstonComplete(completed)).toBe(true);
    });
  });
});

// ============================================================================
// 6. Deck Building
// ============================================================================

describe("Deck Building", () => {
  describe("moveCardToDeck", () => {
    it("moves a card from sideboard to deck", () => {
      let draft = setupDeckBuildingDraft();
      const seat = draft.seats[0];
      // Move first card to sideboard first
      const cardId = seat.deck![0].scryfallId;
      draft = moveCardToSideboard(draft, 0, cardId);
      // Now move it back
      draft = moveCardToDeck(draft, 0, cardId);
      expect(draft.seats[0].deck!.some((c) => c.scryfallId === cardId)).toBe(true);
      expect(draft.seats[0].sideboard!.some((c) => c.scryfallId === cardId)).toBe(false);
    });

    it("rejects when not in deck_building", () => {
      const draft = setupActiveDraft();
      expect(() => moveCardToDeck(draft, 0, "c1")).toThrow(
        "Draft is not in deck building phase"
      );
    });

    it("rejects card not in sideboard", () => {
      const draft = setupDeckBuildingDraft();
      expect(() => moveCardToDeck(draft, 0, "nonexistent")).toThrow(
        "Card nonexistent not found in sideboard"
      );
    });
  });

  describe("moveCardToSideboard", () => {
    it("moves a card from deck to sideboard", () => {
      const draft = setupDeckBuildingDraft();
      const cardId = draft.seats[0].deck![0].scryfallId;
      const updated = moveCardToSideboard(draft, 0, cardId);
      expect(updated.seats[0].sideboard!.some((c) => c.scryfallId === cardId)).toBe(true);
      expect(updated.seats[0].deck!.some((c) => c.scryfallId === cardId)).toBe(false);
    });
  });

  describe("setBasicLands", () => {
    it("sets basic land counts", () => {
      const draft = setupDeckBuildingDraft();
      const lands = { W: 5, U: 5, B: 3, R: 2, G: 2 };
      const updated = setBasicLands(draft, 0, lands);
      expect(updated.seats[0].basicLands).toEqual(lands);
    });
  });

  describe("suggestLandCounts", () => {
    it("suggests lands proportional to colors", () => {
      const pool = [
        ...Array(6).fill(null).map((_, i) => makeCard(`w${i}`, { colors: ["W"] })),
        ...Array(4).fill(null).map((_, i) => makeCard(`u${i}`, { colors: ["U"] })),
      ];
      const lands = suggestLandCounts(pool);
      expect(lands.W).toBeGreaterThan(lands.U);
      expect(lands.W + lands.U).toBe(17);
      expect(lands.B).toBe(0);
      expect(lands.R).toBe(0);
      expect(lands.G).toBe(0);
    });

    it("distributes evenly when no colors", () => {
      const pool = [makeCard("c1", { colors: [] })];
      const lands = suggestLandCounts(pool);
      const total = lands.W + lands.U + lands.B + lands.R + lands.G;
      expect(total).toBe(17);
    });

    it("handles empty pool", () => {
      const lands = suggestLandCounts([]);
      const total = lands.W + lands.U + lands.B + lands.R + lands.G;
      expect(total).toBe(17);
    });
  });

  describe("submitDeck / unsubmitDeck", () => {
    it("marks a seat as submitted", () => {
      const draft = setupDeckBuildingDraft();
      const updated = submitDeck(draft, 0);
      expect(updated.seats[0].hasSubmittedDeck).toBe(true);
      expect(updated.status).toBe("deck_building");
    });

    it("completes draft when all submit", () => {
      let draft = setupDeckBuildingDraft();
      for (let i = 0; i < 4; i++) {
        draft = submitDeck(draft, i);
      }
      expect(draft.status).toBe("complete");
      expect(draft.completedAt).not.toBeNull();
    });

    it("unsubmit reverts to deck_building from complete", () => {
      let draft = setupDeckBuildingDraft();
      for (let i = 0; i < 4; i++) {
        draft = submitDeck(draft, i);
      }
      expect(draft.status).toBe("complete");
      draft = unsubmitDeck(draft, 0);
      expect(draft.status).toBe("deck_building");
      expect(draft.completedAt).toBeNull();
      expect(draft.seats[0].hasSubmittedDeck).toBe(false);
    });

    it("unsubmit during deck_building keeps status", () => {
      let draft = setupDeckBuildingDraft();
      draft = submitDeck(draft, 0);
      draft = unsubmitDeck(draft, 0);
      expect(draft.status).toBe("deck_building");
      expect(draft.seats[0].hasSubmittedDeck).toBe(false);
    });
  });

  describe("isDeckValid", () => {
    it("valid when deck + lands >= 40", () => {
      const seat: DraftSeat = {
        position: 0,
        userId: "u1",
        displayName: "P1",
        currentPack: null,
        picks: [],
        pool: makePack(23),
        deck: makePack(23),
        sideboard: [],
        queuedCardId: null,
        basicLands: { W: 5, U: 5, B: 3, R: 2, G: 2 },
        hasSubmittedDeck: false,
        packQueue: [],
        packReceivedAt: null,
      };
      expect(isDeckValid(seat)).toBe(true); // 23 + 17 = 40
    });

    it("invalid when deck + lands < 40", () => {
      const seat: DraftSeat = {
        position: 0,
        userId: "u1",
        displayName: "P1",
        currentPack: null,
        picks: [],
        pool: makePack(10),
        deck: makePack(10),
        sideboard: [],
        queuedCardId: null,
        basicLands: { W: 0, U: 0, B: 0, R: 0, G: 0 },
        hasSubmittedDeck: false,
        packQueue: [],
        packReceivedAt: null,
      };
      expect(isDeckValid(seat)).toBe(false); // 10 + 0 = 10
    });
  });
});

// ============================================================================
// Integration: Full Draft Flow
// ============================================================================

describe("Full draft flow (integration)", () => {
  it("runs a 2-player, 1-pack, 3-card draft end to end", () => {
    // Create and populate
    let draft = createDraft({
      ...baseConfig,
      playerCount: 2,
      packsPerPlayer: 1,
      cardsPerPack: 3,
    });
    draft = addPlayer(draft, "alice", "Alice");
    draft = addPlayer(draft, "bob", "Bob");
    draft = confirmDraft(draft);

    // Start with 2 packs of 3 cards each
    const packs = [makePack(3, 0), makePack(3, 100)];
    draft = startDraft(draft, packs);
    expect(draft.status).toBe("active");

    // Pick 1: Both pick, then pass
    for (let i = 0; i < 2; i++) {
      draft = makePick(draft, i, draft.seats[i].currentPack!.cards[0].scryfallId);
    }
    expect(allPlayersHavePicked(draft)).toBe(true);
    draft = passCurrentPacks(draft);

    // Pick 2: Both pick, then pass
    for (let i = 0; i < 2; i++) {
      draft = makePick(draft, i, draft.seats[i].currentPack!.cards[0].scryfallId);
    }
    draft = passCurrentPacks(draft);

    // Pick 3: Last card, packs should be empty after
    for (let i = 0; i < 2; i++) {
      draft = makePick(draft, i, draft.seats[i].currentPack!.cards[0].scryfallId);
    }
    expect(isRoundComplete(draft)).toBe(true);

    // Each player picked 3 cards total
    expect(draft.seats[0].pool).toHaveLength(3);
    expect(draft.seats[1].pool).toHaveLength(3);

    // Transition to deck building
    draft = transitionToDeckBuilding(draft);
    expect(draft.status).toBe("deck_building");
    expect(draft.seats[0].deck).toHaveLength(3);
    expect(draft.seats[0].sideboard).toEqual([]);

    // Both submit
    draft = submitDeck(draft, 0);
    expect(draft.status).toBe("deck_building");
    draft = submitDeck(draft, 1);
    expect(draft.status).toBe("complete");
  });
});
