"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import type { CardReference } from "@/lib/types";
import type { Json } from "@/lib/database.types";
import {
  createDraft,
  addPlayer,
  confirmDraft,
  startDraft as engineStartDraft,
  initializeWinston,
} from "@/lib/draft-engine";
import {
  fetchBoosterCards,
  scryfallCardToReference,
} from "@/lib/scryfall";
import { generateCubePacks } from "@/lib/pack-generator";
import { generatePacksForSet, generateMixedPacks } from "@/lib/generate-packs";
import { botUserId, botDisplayName } from "@/lib/bot-drafter";

interface SimulateConfig {
  format: "standard" | "winston" | "cube";
  setCode?: string;
  setName?: string;
  playerCount: number;
  packsPerPlayer: number;
  mixedPacks?: boolean;
  packSets?: { code: string; name: string }[];
  cubeList?: string[];
  cubeSource?: "text" | "cubecobra";
  deckBuildingEnabled: boolean;
  timerPreset?: "relaxed" | "competitive" | "speed" | "none";
  reviewPeriodSeconds?: number;
  pacingMode?: "realtime" | "async";
  asyncDeadlineMinutes?: number;
  pickHistoryPublic?: boolean;
}

export async function createSimulatedDraftAction(config: SimulateConfig) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Get user profile for display name
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const admin = createAdminClient();

  // Create the draft row (no group, is_simulated=true)
  const { data: dbDraft, error } = await admin
    .from("drafts")
    .insert({
      host_id: user.id,
      group_id: null,
      format: config.format,
      set_code: config.setCode ?? null,
      set_name: config.setName ?? null,
      status: "active",
      is_simulated: true,
      config: {} as Json,
    })
    .select("id")
    .single();

  if (error || !dbDraft) {
    redirect("/dashboard/simulate?error=" + encodeURIComponent(error?.message ?? "Failed to create draft"));
  }

  const draftId = dbDraft.id;

  // Add only the human player to draft_players (for RLS access)
  await admin.from("draft_players").insert({
    draft_id: draftId,
    user_id: user.id,
    seat_position: 0,
  });

  // Build Draft state object via engine
  let draftObj = createDraft({
    id: draftId,
    groupId: "",
    hostId: user.id,
    format: config.format,
    pacingMode: config.pacingMode ?? "realtime",
    setCode: config.setCode,
    setName: config.setName,
    cubeList: config.cubeList,
    cubeSource: config.cubeSource,
    playerCount: config.playerCount,
    packsPerPlayer: config.packsPerPlayer,
    timerPreset: config.timerPreset ?? "none",
    reviewPeriodSeconds: config.reviewPeriodSeconds ?? 0,
    deckBuildingEnabled: config.deckBuildingEnabled,
    pickHistoryPublic: config.pickHistoryPublic ?? true,
    asyncDeadlineMinutes: config.asyncDeadlineMinutes ?? null,
  });

  // Add human player as seat 0
  draftObj = addPlayer(
    draftObj,
    user.id,
    profile?.display_name ?? "Player"
  );

  // Add bot players for remaining seats
  const botCount = config.playerCount - 1;
  for (let i = 0; i < botCount; i++) {
    draftObj = addPlayer(draftObj, botUserId(i + 1), botDisplayName(i + 1));
  }

  draftObj = confirmDraft(draftObj);

  // Generate packs based on format
  let allPacks: CardReference[][] = [];

  if (config.format === "standard") {
    if (config.mixedPacks && config.packSets && config.packSets.length === config.packsPerPlayer) {
      allPacks = await generateMixedPacks(config.packSets, config.playerCount);
    } else {
      const setCode = config.setCode;
      if (!setCode) {
        redirect("/dashboard/simulate?error=" + encodeURIComponent("No set selected"));
      }
      allPacks = await generatePacksForSet(setCode, config.playerCount, config.packsPerPlayer);
    }

    // Set cardsPerPack from actual pack size (sheet-based packs may differ from template)
    if (allPacks.length > 0) {
      draftObj = { ...draftObj, cardsPerPack: allPacks[0].length };
    }
  } else if (config.format === "cube") {
    const cubeList = config.cubeList;
    if (!cubeList || cubeList.length === 0) {
      redirect("/dashboard/simulate?error=" + encodeURIComponent("No cube list provided"));
    }

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
      config.playerCount,
      config.packsPerPlayer,
      draftObj.cardsPerPack
    );
  } else if (config.format === "winston") {
    // Winston uses a flat pool, not individual packs
    const setCode = config.setCode;
    if (!setCode) {
      redirect("/dashboard/simulate?error=" + encodeURIComponent("No set selected"));
    }

    const scryfallCards = await fetchBoosterCards(setCode);
    const cardRefs = scryfallCards.map((c) => scryfallCardToReference(c));

    const poolSize = 90;
    const shuffled = [...cardRefs].sort(() => Math.random() - 0.5);
    const pool = shuffled.slice(0, poolSize);

    draftObj = engineStartDraft(draftObj, []);
    draftObj = initializeWinston(draftObj, pool);

    // Save state and redirect
    await admin
      .from("drafts")
      .update({
        state: draftObj as unknown as Json,
        status: "active",
        started_at: new Date().toISOString(),
        version: 1,
        config: { ...config } as unknown as Json,
      })
      .eq("id", draftId);

    redirect(`/draft/${draftId}/winston`);
  }

  // For standard/cube: distribute first pack, store rest
  const firstRoundPacks = allPacks.slice(0, config.playerCount);
  draftObj = engineStartDraft(draftObj, firstRoundPacks);

  // Store allPacks in config for later rounds
  const updatedConfig = {
    ...config,
    allPacks,
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

  redirect(`/draft/${draftId}/pick`);
}
