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
  fetchSetInfo,
  getPackEra,
  scryfallCardToReference,
  groupCardsByRarity,
} from "@/lib/scryfall";
import {
  generateAllPacks,
  generateCubePacks,
  getTemplateForSet,
} from "@/lib/pack-generator";
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
      // Mixed packs: different set per round
      const uniqueCodes = [...new Set(config.packSets.map((s) => s.code))];
      const fetchResults = await Promise.all(
        uniqueCodes.map(async (code) => {
          const [cards, info] = await Promise.all([
            fetchBoosterCards(code),
            fetchSetInfo(code),
          ]);
          return { code, cards, info };
        })
      );

      const dataBySet = new Map(
        fetchResults.map((r) => {
          const grouped = groupCardsByRarity(r.cards);
          const cardPool: Record<string, CardReference[]> = {
            common: grouped.common.map((c) => scryfallCardToReference(c)),
            uncommon: grouped.uncommon.map((c) => scryfallCardToReference(c)),
            rare: grouped.rare.map((c) => scryfallCardToReference(c)),
            mythic: grouped.mythic.map((c) => scryfallCardToReference(c)),
            land: grouped.land.map((c) => scryfallCardToReference(c)),
          };
          const era = getPackEra(r.info.released_at);
          const template = getTemplateForSet(r.code, era);
          return [r.code, { cardPool, template }] as const;
        })
      );

      for (let round = 0; round < config.packsPerPlayer; round++) {
        const setCode = config.packSets[round].code;
        const { cardPool, template } = dataBySet.get(setCode)!;
        const roundPacks = generateAllPacks(cardPool, template, config.playerCount, 1);
        allPacks.push(...roundPacks);
      }
    } else {
      // Single set for all packs
      const setCode = config.setCode;
      if (!setCode) {
        redirect("/dashboard/simulate?error=" + encodeURIComponent("No set selected"));
      }

      const [scryfallCards, setInfo] = await Promise.all([
        fetchBoosterCards(setCode),
        fetchSetInfo(setCode),
      ]);
      const grouped = groupCardsByRarity(scryfallCards);

      const cardPool: Record<string, CardReference[]> = {
        common: grouped.common.map((c) => scryfallCardToReference(c)),
        uncommon: grouped.uncommon.map((c) => scryfallCardToReference(c)),
        rare: grouped.rare.map((c) => scryfallCardToReference(c)),
        mythic: grouped.mythic.map((c) => scryfallCardToReference(c)),
        land: grouped.land.map((c) => scryfallCardToReference(c)),
      };

      const era = getPackEra(setInfo.released_at);
      const template = getTemplateForSet(setCode, era);
      allPacks = generateAllPacks(
        cardPool,
        template,
        config.playerCount,
        config.packsPerPlayer
      );
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
