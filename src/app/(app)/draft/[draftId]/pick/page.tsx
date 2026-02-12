import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Draft } from "@/lib/types";
import { hydrateSeat } from "@/lib/draft-engine";
import PickClient from "./PickClient";

export default async function PickPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const { draftId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

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

  return (
    <PickClient
      draftId={draftId}
      packCards={seat.currentPack?.cards ?? []}
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
    />
  );
}
