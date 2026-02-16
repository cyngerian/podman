import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient, getUser } from "@/lib/supabase-server";
import type { Draft, PodMemberStatus } from "@/lib/types";
import { hydrateSeat } from "@/lib/draft-engine";
import { hydrateCardTypeLines } from "@/lib/scryfall";
import { isBotUserId } from "@/lib/bot-drafter";
import PickClient from "./PickClient";

export default async function PickPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const { draftId } = await params;

  const user = await getUser();

  if (!user) redirect("/auth/login");

  const supabase = await createServerSupabaseClient();

  const { data: dbDraft } = await supabase
    .from("drafts")
    .select("id, status, state, config")
    .eq("id", draftId)
    .single();

  if (!dbDraft) notFound();
  if (dbDraft.status !== "active") redirect(`/draft/${draftId}`);

  const draft = dbDraft.state as unknown as Draft;
  if (!draft) redirect(`/draft/${draftId}`);

  // Only send the current user's seat data (never leak other players' packs)
  const rawSeat = draft.seats.find((s) => s.userId === user.id);
  if (!rawSeat) redirect(`/draft/${draftId}`);

  const seat = hydrateSeat(rawSeat);

  // Fetch profile avatars for real (non-bot) users
  const humanUserIds = draft.seats
    .map((s) => s.userId)
    .filter((id) => !isBotUserId(id));

  // Hydrate card type lines + fetch profiles in parallel
  const [packCards, profileRows] = await Promise.all([
    seat.currentPack?.cards
      ? hydrateCardTypeLines(seat.currentPack.cards)
      : Promise.resolve([]),
    humanUserIds.length > 0
      ? supabase
          .from("profiles")
          .select("id, avatar_url, favorite_color")
          .in("id", humanUserIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  const profileMap = new Map(
    profileRows.map((p) => [p.id, {
      avatarUrl: p.avatar_url as string | null,
      favoriteColor: p.favorite_color as string | null,
    }])
  );

  // Build pod status for all players (including current user)
  const podMembers: PodMemberStatus[] = draft.seats.map((s) => {
    const h = hydrateSeat(s);
    const profile = profileMap.get(s.userId);
    return {
      position: h.position,
      displayName: h.displayName,
      pickCount: h.picks.length,
      isCurrentlyPicking: h.currentPack !== null,
      queuedPacks: h.packQueue.length,
      avatarUrl: profile?.avatarUrl ?? null,
      favoriteColor: profile?.favoriteColor ?? null,
      isCurrentUser: s.userId === user.id,
    };
  });

  return (
    <PickClient
      key={seat.packReceivedAt ?? "waiting"}
      draftId={draftId}
      setCode={draft.setCode}
      setName={draft.setName}
      startedAt={draft.startedAt}
      packCards={packCards}
      packNumber={seat.currentPack?.round ?? draft.currentPack}
      pickInPack={seat.currentPack?.pickNumber ?? 0}
      totalCardsInPack={draft.cardsPerPack}
      picks={seat.pool}
      timerPreset={draft.timerPreset}
      pacingMode={draft.pacingMode}
      packReceivedAt={seat.packReceivedAt}
      packQueueLength={seat.packQueue.length}
      podMembers={podMembers}
      initialDeck={seat.deck}
      initialSideboard={seat.sideboard}
    />
  );
}
