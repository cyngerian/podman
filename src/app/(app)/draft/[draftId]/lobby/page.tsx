import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient, getUser } from "@/lib/supabase-server";
import type { Draft } from "@/lib/types";
import LobbyClient from "./LobbyClient";

export default async function LobbyPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const { draftId } = await params;

  const user = await getUser();

  if (!user) redirect("/auth/login");

  const supabase = await createServerSupabaseClient();

  // Fetch draft and players in parallel
  const [{ data: dbDraft }, { data: players }] = await Promise.all([
    supabase.from("drafts").select("*").eq("id", draftId).single(),
    supabase
      .from("draft_players")
      .select("user_id, seat_position, profiles(display_name)")
      .eq("draft_id", draftId)
      .order("joined_at", { ascending: true }),
  ]);

  if (!dbDraft) notFound();

  if (dbDraft.status !== "lobby") {
    redirect(`/draft/${draftId}`);
  }

  const playerList = (players ?? []).map((p) => ({
    userId: p.user_id,
    displayName: p.profiles?.display_name ?? "Unknown",
    seatPosition: p.seat_position,
  }));

  const config = (dbDraft.config ?? {}) as Record<string, unknown>;

  // Construct a Draft object for the DraftLobby component
  const draft: Draft = {
    id: dbDraft.id,
    groupId: dbDraft.group_id,
    hostId: dbDraft.host_id,
    format: dbDraft.format as Draft["format"],
    pacingMode: (config.pacingMode as Draft["pacingMode"]) ?? "realtime",
    status: "proposed", // DraftLobby expects proposed/confirmed
    setCode: dbDraft.set_code,
    setName: dbDraft.set_name,
    cubeList: (config.cubeList as string[] | null) ?? null,
    cubeSource: (config.cubeSource as Draft["cubeSource"]) ?? null,
    deckBuildingEnabled: (config.deckBuildingEnabled as boolean) ?? true,
    pickHistoryPublic: (config.pickHistoryPublic as boolean) ?? false,
    playerCount: (config.playerCount as number) ?? playerList.length,
    packsPerPlayer: (config.packsPerPlayer as number) ?? 3,
    cardsPerPack: (config.cardsPerPack as number) ?? 14,
    timerPreset: (config.timerPreset as Draft["timerPreset"]) ?? "competitive",
    reviewPeriodSeconds: (config.reviewPeriodSeconds as number) ?? 60,
    asyncDeadlineMinutes: (config.asyncDeadlineMinutes as number | null) ?? null,
    currentPack: 1,
    seats: playerList.map((p, i) => ({
      position: p.seatPosition ?? i,
      userId: p.userId,
      displayName: p.displayName,
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
    })),
    winstonState: null,
    createdAt: new Date(dbDraft.created_at).getTime(),
    startedAt: null,
    completedAt: null,
  };

  const isHost = dbDraft.host_id === user.id;

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <LobbyClient
        draft={draft}
        draftId={draftId}
        currentUserId={user.id}
        isHost={isHost}
      />
    </div>
  );
}
