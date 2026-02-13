// ============================================================================
// Bot Runner — Orchestrates bot picks in simulated drafts
// ============================================================================

import type { Draft, CardReference } from "./types";
import {
  makePickAndPass,
  isIndividualRoundComplete,
  advanceToNextPack,
  transitionToDeckBuilding,
  completeDraft,
  hydrateSeat,
  submitDeck as engineSubmitDeck,
  suggestLandCounts,
  winstonTakePile,
  winstonPassPile,
  isWinstonComplete,
} from "./draft-engine";
import { isBotUserId, botPickCard, botWinstonDecision } from "./bot-drafter";

const MAX_STANDARD_ITERATIONS = 500;
const MAX_WINSTON_ITERATIONS = 200;

// ============================================================================
// Standard/Cube Draft Bot Picks
// ============================================================================

/**
 * After a human picks, loop through all bot seats that have packs and
 * make picks for them. Continues until a pack reaches the human again
 * or the round/draft completes.
 *
 * This function is pure — it transforms Draft state without side effects.
 */
export function runBotPicks(
  draft: Draft,
  allPacks: CardReference[][] | null
): Draft {
  let updated = draft;

  for (let i = 0; i < MAX_STANDARD_ITERATIONS; i++) {
    // Find any bot seat that has a currentPack with cards
    const botSeat = updated.seats.find(
      (s) =>
        isBotUserId(s.userId) &&
        s.currentPack &&
        s.currentPack.cards.length > 0
    );

    if (!botSeat) break; // No bots have packs — done

    const seat = hydrateSeat(botSeat);
    const pack = seat.currentPack!;
    const pickedCard = botPickCard(pack.cards, seat.pool);

    updated = makePickAndPass(updated, seat.position, pickedCard.scryfallId);

    // Check if the round is complete after this bot pick
    if (isIndividualRoundComplete(updated)) {
      updated = handleRoundCompletion(updated, allPacks);
      if (updated.status !== "active") break; // Draft finished or deck building
    }
  }

  // If we transitioned to deck_building, auto-submit for all bots
  if (updated.status === "deck_building") {
    updated = autoSubmitBotDecks(updated);
  }

  return updated;
}

// ============================================================================
// Winston Draft Bot Turns
// ============================================================================

/**
 * While the active player is a bot, run their Winston turns automatically.
 * Bots evaluate each pile and decide to take or pass.
 */
export function runWinstonBotTurns(draft: Draft): Draft {
  let updated = draft;

  for (let i = 0; i < MAX_WINSTON_ITERATIONS; i++) {
    if (!updated.winstonState || isWinstonComplete(updated)) break;

    const activePlayerIndex = updated.winstonState.activePlayerIndex;
    const activeSeat = updated.seats[activePlayerIndex];
    if (!activeSeat || !isBotUserId(activeSeat.userId)) break; // Human's turn

    const pileIndex = updated.winstonState.activePile;
    if (pileIndex === null) break;

    const pile = updated.winstonState.piles[pileIndex];
    const decision = botWinstonDecision(pile, activeSeat.pool, pileIndex);

    if (decision === "take") {
      updated = winstonTakePile(updated);
    } else {
      updated = winstonPassPile(updated);
    }

    if (isWinstonComplete(updated)) {
      updated = updated.deckBuildingEnabled
        ? transitionToDeckBuilding(updated)
        : completeDraft(updated);
      break;
    }
  }

  // If we transitioned to deck_building, auto-submit for bots
  if (updated.status === "deck_building") {
    updated = autoSubmitBotDecks(updated);
  }

  return updated;
}

// ============================================================================
// Helpers
// ============================================================================

function handleRoundCompletion(
  draft: Draft,
  allPacks: CardReference[][] | null
): Draft {
  if (draft.currentPack < draft.packsPerPlayer && allPacks) {
    const nextPackStart = draft.currentPack * draft.seats.length;
    const nextPacks = allPacks.slice(
      nextPackStart,
      nextPackStart + draft.seats.length
    );
    if (nextPacks.length >= draft.seats.length) {
      return advanceToNextPack(draft, nextPacks);
    }
  }

  return draft.deckBuildingEnabled
    ? transitionToDeckBuilding(draft)
    : completeDraft(draft);
}

function autoSubmitBotDecks(draft: Draft): Draft {
  let updated = draft;

  for (const seat of updated.seats) {
    if (isBotUserId(seat.userId) && !seat.hasSubmittedDeck) {
      // Set deck = entire pool, empty sideboard, auto-suggest lands
      const updatedSeats = updated.seats.map((s) =>
        s.position === seat.position
          ? {
              ...s,
              deck: [...s.pool],
              sideboard: [],
              basicLands: suggestLandCounts(s.pool),
            }
          : s
      );
      updated = engineSubmitDeck(
        { ...updated, seats: updatedSeats },
        seat.position
      );
    }
  }

  return updated;
}
