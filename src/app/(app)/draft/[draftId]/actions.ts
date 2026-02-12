"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import type { Draft, CardReference } from "@/lib/types";
import type { Json } from "@/lib/database.types";
import {
  createDraft,
  addPlayer,
  confirmDraft,
  startDraft as engineStartDraft,
  initializeWinston,
  makePick,
  passCurrentPacks,
  allPlayersHavePicked,
  isRoundComplete,
  advanceToNextPack,
  autoPickCard,
  transitionToDeckBuilding,
  completeDraft,
  submitDeck as engineSubmitDeck,
  winstonTakePile,
  winstonPassPile,
  winstonLookAtPile as engineWinstonLook,
  isWinstonComplete,
  suggestLandCounts,
} from "@/lib/draft-engine";
import {
  fetchBoosterCards,
  fetchSetInfo,
  getPackEra,
  scryfallCardToReference,
  groupCardsByRarity,
} from "@/lib/scryfall";
import { generateAllPacks, generateCubePacks, getTemplateForSet } from "@/lib/pack-generator";

// ============================================================================
// Helpers
// ============================================================================

async function getAuthenticatedUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  return user;
}

/**
 * Apply a mutation to draft state with optimistic concurrency control.
 * Uses admin client to bypass RLS (since only host can update drafts via RLS).
 */
async function applyDraftMutation(
  draftId: string,
  mutate: (draft: Draft, allPacks: CardReference[][] | null) => Draft,
  opts?: { updateStatus?: boolean; updateStartedAt?: boolean; updateCompletedAt?: boolean }
): Promise<{ success: boolean; draft?: Draft; error?: string }> {
  const admin = createAdminClient();

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await admin
      .from("drafts")
      .select("state, config, version, status")
      .eq("id", draftId)
      .single();

    if (error || !data) {
      return { success: false, error: error?.message ?? "Draft not found" };
    }

    const currentVersion = data.version;
    const state = data.state as unknown as Draft;
    const config = data.config as Record<string, unknown>;
    const allPacks = (config.allPacks as CardReference[][] | undefined) ?? null;

    if (!state) {
      return { success: false, error: "Draft has no state" };
    }

    let updatedDraft: Draft;
    try {
      updatedDraft = mutate(state, allPacks);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Mutation failed" };
    }

    const updatePayload: Record<string, unknown> = {
      state: updatedDraft as unknown as Json,
      version: currentVersion + 1,
    };

    if (opts?.updateStatus) {
      updatePayload.status = updatedDraft.status === "deck_building" ? "deck_building" : updatedDraft.status;
    }
    if (opts?.updateStartedAt && updatedDraft.startedAt) {
      updatePayload.started_at = new Date(updatedDraft.startedAt).toISOString();
    }
    if (opts?.updateCompletedAt && updatedDraft.completedAt) {
      updatePayload.completed_at = new Date(updatedDraft.completedAt).toISOString();
    }

    const { error: updateError, count } = await admin
      .from("drafts")
      .update(updatePayload)
      .eq("id", draftId)
      .eq("version", currentVersion);

    // If count is 0, version mismatch — retry
    if (count === 0 && !updateError) {
      continue;
    }

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true, draft: updatedDraft };
  }

  return { success: false, error: "Version conflict after 3 retries" };
}

// ============================================================================
// Lobby Actions
// ============================================================================

export async function joinDraft(draftId: string) {
  const user = await getAuthenticatedUser();
  const supabase = await createServerSupabaseClient();

  // Check if already a player
  const { data: existing } = await supabase
    .from("draft_players")
    .select("user_id")
    .eq("draft_id", draftId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    await supabase.from("draft_players").insert({
      draft_id: draftId,
      user_id: user.id,
    });
  }
}

export async function leaveDraft(draftId: string) {
  const user = await getAuthenticatedUser();
  const supabase = await createServerSupabaseClient();

  await supabase
    .from("draft_players")
    .delete()
    .eq("draft_id", draftId)
    .eq("user_id", user.id);

  redirect("/dashboard");
}

export async function startDraftAction(draftId: string) {
  const user = await getAuthenticatedUser();
  const admin = createAdminClient();

  // Load draft
  const { data: draft } = await admin
    .from("drafts")
    .select("*")
    .eq("id", draftId)
    .single();

  if (!draft) throw new Error("Draft not found");
  if (draft.host_id !== user.id) throw new Error("Only the host can start the draft");
  if (draft.status !== "lobby") throw new Error("Draft is not in lobby status");

  // Load players with profiles
  const { data: players } = await admin
    .from("draft_players")
    .select("user_id, profiles(display_name)")
    .eq("draft_id", draftId);

  if (!players || players.length < 2) {
    throw new Error("Need at least 2 players to start");
  }

  const config = (draft.config ?? {}) as Record<string, unknown>;

  // Build Draft object via engine
  let draftObj = createDraft({
    id: draftId,
    groupId: draft.group_id,
    hostId: draft.host_id,
    format: draft.format as "standard" | "winston" | "cube",
    pacingMode: (config.pacingMode as "realtime" | "async") ?? "realtime",
    setCode: draft.set_code ?? undefined,
    setName: draft.set_name ?? undefined,
    cubeList: (config.cubeList as string[] | undefined) ?? undefined,
    cubeSource: (config.cubeSource as "text" | "cubecobra" | undefined) ?? undefined,
    playerCount: players.length,
    timerPreset: (config.timerPreset as "relaxed" | "competitive" | "speed" | "none") ?? "competitive",
    reviewPeriodSeconds: (config.reviewPeriodSeconds as number) ?? 60,
    deckBuildingEnabled: (config.deckBuildingEnabled as boolean) ?? true,
    pickHistoryPublic: (config.pickHistoryPublic as boolean) ?? false,
    asyncDeadlineMinutes: (config.asyncDeadlineMinutes as number | null) ?? null,
  });

  // Shuffle and add players (randomizes seat positions)
  const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
  for (const p of shuffledPlayers) {
    draftObj = addPlayer(
      draftObj,
      p.user_id,
      p.profiles?.display_name ?? "Unknown"
    );
  }

  draftObj = confirmDraft(draftObj);

  // Generate packs based on format
  let allPacks: CardReference[][] = [];

  if (draft.format === "standard") {
    // Fetch cards from Scryfall
    const setCode = draft.set_code;
    if (!setCode) throw new Error("No set code configured");

    const [scryfallCards, setInfo] = await Promise.all([
      fetchBoosterCards(setCode),
      fetchSetInfo(setCode),
    ]);
    const grouped = groupCardsByRarity(scryfallCards);

    const cardPool = {
      common: grouped.common.map((c) => scryfallCardToReference(c)),
      uncommon: grouped.uncommon.map((c) => scryfallCardToReference(c)),
      rare: grouped.rare.map((c) => scryfallCardToReference(c)),
      mythic: grouped.mythic.map((c) => scryfallCardToReference(c)),
    };

    const era = getPackEra(setInfo.released_at);
    const template = getTemplateForSet(setCode, era);
    allPacks = generateAllPacks(
      cardPool,
      template,
      players.length,
      draftObj.packsPerPlayer
    );
  } else if (draft.format === "cube") {
    const cubeList = config.cubeList as string[] | undefined;
    if (!cubeList || cubeList.length === 0) throw new Error("No cube list configured");

    // Resolve cube card names to CardReferences
    // For now, create placeholder refs from the list
    // In production, these would be fetched from Scryfall
    const cubeCards: CardReference[] = cubeList.map((name, i) => ({
      scryfallId: `cube-${i}`,
      name,
      imageUri: "",
      smallImageUri: "",
      rarity: "common" as const,
      colors: [],
      cmc: 0,
      isFoil: false,
    }));

    allPacks = generateCubePacks(
      cubeCards,
      players.length,
      draftObj.packsPerPlayer,
      draftObj.cardsPerPack
    );
  } else if (draft.format === "winston") {
    // Winston uses a flat pool, not individual packs
    const setCode = draft.set_code;
    if (!setCode) throw new Error("No set code configured for Winston");

    const scryfallCards = await fetchBoosterCards(setCode);
    const cardRefs = scryfallCards.map((c) => scryfallCardToReference(c));

    // For Winston, we need ~90 cards
    const poolSize = 90;
    const shuffled = [...cardRefs].sort(() => Math.random() - 0.5);
    const pool = shuffled.slice(0, poolSize);

    draftObj = engineStartDraft(draftObj, []);
    draftObj = initializeWinston(draftObj, pool);

    // Assign seat positions in DB
    for (let i = 0; i < shuffledPlayers.length; i++) {
      await admin
        .from("draft_players")
        .update({ seat_position: i })
        .eq("draft_id", draftId)
        .eq("user_id", shuffledPlayers[i].user_id);
    }

    // Save state
    await admin
      .from("drafts")
      .update({
        state: draftObj as unknown as Json,
        status: "active",
        started_at: new Date().toISOString(),
        version: 1,
        config: { ...config } as Json,
      })
      .eq("id", draftId);

    return;
  }

  // For standard/cube: distribute first pack, store rest
  const firstRoundPacks = allPacks.slice(0, players.length);
  const remainingPacks = allPacks.slice(players.length);

  draftObj = engineStartDraft(draftObj, firstRoundPacks);

  // Assign seat positions in DB
  for (let i = 0; i < shuffledPlayers.length; i++) {
    await admin
      .from("draft_players")
      .update({ seat_position: i })
      .eq("draft_id", draftId)
      .eq("user_id", shuffledPlayers[i].user_id);
  }

  // Store allPacks in config for later rounds
  const updatedConfig = {
    ...config,
    allPacks: allPacks,
  };

  await admin
    .from("drafts")
    .update({
      state: draftObj as unknown as Json,
      status: "active",
      started_at: new Date().toISOString(),
      version: 1,
      config: updatedConfig as unknown as Json,
    })
    .eq("id", draftId);
}

// ============================================================================
// Pick Actions (Standard/Cube)
// ============================================================================

export async function makePickAction(draftId: string, cardId: string) {
  const user = await getAuthenticatedUser();

  const result = await applyDraftMutation(
    draftId,
    (draft, allPacks) => {
      const seat = draft.seats.find((s) => s.userId === user.id);
      if (!seat) throw new Error("You are not in this draft");

      let updated = makePick(draft, seat.position, cardId);

      // Check if all players have picked
      if (allPlayersHavePicked(updated)) {
        // Pass packs
        updated = passCurrentPacks(updated);

        // Check if round is complete
        if (isRoundComplete(updated)) {
          if (updated.currentPack < updated.packsPerPlayer && allPacks) {
            // Advance to next pack
            const nextPackStart = updated.currentPack * updated.seats.length;
            const nextPacks = allPacks.slice(
              nextPackStart,
              nextPackStart + updated.seats.length
            );
            if (nextPacks.length >= updated.seats.length) {
              updated = advanceToNextPack(updated, nextPacks);
            } else {
              // No more packs — transition
              updated = draft.deckBuildingEnabled
                ? transitionToDeckBuilding(updated)
                : completeDraft(updated);
            }
          } else {
            // Last round done
            updated = draft.deckBuildingEnabled
              ? transitionToDeckBuilding(updated)
              : completeDraft(updated);
          }
        }
      }

      return updated;
    },
    { updateStatus: true, updateCompletedAt: true }
  );

  if (!result.success) {
    throw new Error(result.error ?? "Pick failed");
  }
}

export async function autoPickAction(draftId: string) {
  const user = await getAuthenticatedUser();

  const result = await applyDraftMutation(
    draftId,
    (draft, allPacks) => {
      const seat = draft.seats.find((s) => s.userId === user.id);
      if (!seat) throw new Error("You are not in this draft");
      if (!seat.currentPack || seat.currentPack.cards.length === 0) {
        throw new Error("No pack to pick from");
      }

      const card = autoPickCard(seat.currentPack.cards, seat.queuedCardId);
      let updated = makePick(draft, seat.position, card.scryfallId);

      if (allPlayersHavePicked(updated)) {
        updated = passCurrentPacks(updated);

        if (isRoundComplete(updated)) {
          if (updated.currentPack < updated.packsPerPlayer && allPacks) {
            const nextPackStart = updated.currentPack * updated.seats.length;
            const nextPacks = allPacks.slice(
              nextPackStart,
              nextPackStart + updated.seats.length
            );
            if (nextPacks.length >= updated.seats.length) {
              updated = advanceToNextPack(updated, nextPacks);
            } else {
              updated = draft.deckBuildingEnabled
                ? transitionToDeckBuilding(updated)
                : completeDraft(updated);
            }
          } else {
            updated = draft.deckBuildingEnabled
              ? transitionToDeckBuilding(updated)
              : completeDraft(updated);
          }
        }
      }

      return updated;
    },
    { updateStatus: true, updateCompletedAt: true }
  );

  if (!result.success) {
    throw new Error(result.error ?? "Auto-pick failed");
  }
}

export async function getDraftViewForUser(draftId: string) {
  const user = await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data } = await admin
    .from("drafts")
    .select("state, status")
    .eq("id", draftId)
    .single();

  if (!data?.state) return null;

  const draft = data.state as unknown as Draft;
  const seat = draft.seats.find((s) => s.userId === user.id);

  if (!seat) return null;

  return {
    status: draft.status,
    currentPack: draft.currentPack,
    packCards: seat.currentPack?.cards ?? [],
    packNumber: draft.currentPack,
    pickInPack: seat.currentPack?.pickNumber ?? 0,
    totalCardsInPack: draft.cardsPerPack,
    picks: seat.pool,
    pickHistory: seat.picks,
    timerPreset: draft.timerPreset,
    pacingMode: draft.pacingMode,
    format: draft.format,
    seats: draft.seats.map((s) => ({
      position: s.position,
      userId: s.userId,
      displayName: s.displayName,
      hasPicked: !s.currentPack || (seat.currentPack
        ? s.currentPack?.pickNumber !== seat.currentPack?.pickNumber
        : true),
      hasSubmittedDeck: s.hasSubmittedDeck,
    })),
    isRoundComplete: isRoundComplete(draft),
    packsPerPlayer: draft.packsPerPlayer,
    reviewPeriodSeconds: draft.reviewPeriodSeconds,
    deckBuildingEnabled: draft.deckBuildingEnabled,
  };
}

// ============================================================================
// Winston Actions
// ============================================================================

export async function winstonLookAction(draftId: string, pileIndex: number) {
  const user = await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data } = await admin
    .from("drafts")
    .select("state")
    .eq("id", draftId)
    .single();

  if (!data?.state) throw new Error("Draft not found");

  const draft = data.state as unknown as Draft;
  const seat = draft.seats.find((s) => s.userId === user.id);
  if (!seat) throw new Error("You are not in this draft");

  if (
    !draft.winstonState ||
    draft.seats[draft.winstonState.activePlayerIndex]?.userId !== user.id
  ) {
    throw new Error("Not your turn");
  }

  return engineWinstonLook(draft, pileIndex);
}

export async function winstonTakeAction(draftId: string) {
  const user = await getAuthenticatedUser();

  const result = await applyDraftMutation(
    draftId,
    (draft) => {
      if (
        !draft.winstonState ||
        draft.seats[draft.winstonState.activePlayerIndex]?.userId !== user.id
      ) {
        throw new Error("Not your turn");
      }

      let updated = winstonTakePile(draft);

      if (isWinstonComplete(updated)) {
        updated = updated.deckBuildingEnabled
          ? transitionToDeckBuilding(updated)
          : completeDraft(updated);
      }

      return updated;
    },
    { updateStatus: true, updateCompletedAt: true }
  );

  if (!result.success) throw new Error(result.error ?? "Take failed");
}

export async function winstonPassAction(draftId: string) {
  const user = await getAuthenticatedUser();

  const result = await applyDraftMutation(
    draftId,
    (draft) => {
      if (
        !draft.winstonState ||
        draft.seats[draft.winstonState.activePlayerIndex]?.userId !== user.id
      ) {
        throw new Error("Not your turn");
      }

      let updated = winstonPassPile(draft);

      if (isWinstonComplete(updated)) {
        updated = updated.deckBuildingEnabled
          ? transitionToDeckBuilding(updated)
          : completeDraft(updated);
      }

      return updated;
    },
    { updateStatus: true, updateCompletedAt: true }
  );

  if (!result.success) throw new Error(result.error ?? "Pass failed");
}

// ============================================================================
// Deck Building Actions
// ============================================================================

export async function submitDeckAction(
  draftId: string,
  deck: CardReference[],
  sideboard: CardReference[],
  lands: { W: number; U: number; B: number; R: number; G: number }
) {
  const user = await getAuthenticatedUser();

  const result = await applyDraftMutation(
    draftId,
    (draft) => {
      const seat = draft.seats.find((s) => s.userId === user.id);
      if (!seat) throw new Error("You are not in this draft");

      const updatedSeats = draft.seats.map((s) =>
        s.userId === user.id
          ? { ...s, deck, sideboard, basicLands: lands }
          : s
      );

      return engineSubmitDeck({ ...draft, seats: updatedSeats }, seat.position);
    },
    { updateStatus: true, updateCompletedAt: true }
  );

  if (!result.success) throw new Error(result.error ?? "Submit failed");
}

export async function skipDeckBuildingAction(draftId: string) {
  const user = await getAuthenticatedUser();

  const result = await applyDraftMutation(
    draftId,
    (draft) => {
      const seat = draft.seats.find((s) => s.userId === user.id);
      if (!seat) throw new Error("You are not in this draft");

      // Use pool as deck, empty sideboard
      const updatedSeats = draft.seats.map((s) =>
        s.userId === user.id
          ? { ...s, deck: [...s.pool], sideboard: [], basicLands: suggestLandCounts(s.pool) }
          : s
      );

      return engineSubmitDeck({ ...draft, seats: updatedSeats }, seat.position);
    },
    { updateStatus: true, updateCompletedAt: true }
  );

  if (!result.success) throw new Error(result.error ?? "Skip failed");
}
