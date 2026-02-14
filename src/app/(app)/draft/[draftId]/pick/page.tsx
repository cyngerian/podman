import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient, getUser } from "@/lib/supabase-server";
import type { Draft, PodMemberStatus } from "@/lib/types";
import { hydrateSeat } from "@/lib/draft-engine";
import { hydrateCardTypeLines } from "@/lib/scryfall";
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

  // Hydrate missing typeLine for creature/non-creature filtering
  const packCards = seat.currentPack?.cards
    ? await hydrateCardTypeLines(seat.currentPack.cards)
    : [];

  // Build pod status for all other players (no sensitive data)
  const podMembers: PodMemberStatus[] = draft.seats
    .filter((s) => s.userId !== user.id)
    .map((s) => {
      const h = hydrateSeat(s);
      return {
        position: h.position,
        displayName: h.displayName,
        pickCount: h.picks.length,
        isCurrentlyPicking: h.currentPack !== null,
        queuedPacks: h.packQueue.length,
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
      packsPerPlayer={draft.packsPerPlayer}
      deckBuildingEnabled={draft.deckBuildingEnabled}
      packReceivedAt={seat.packReceivedAt}
      packQueueLength={seat.packQueue.length}
      podMembers={podMembers}
      initialDeck={seat.deck}
      initialSideboard={seat.sideboard}
    />
  );
}
