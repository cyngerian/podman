import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Draft } from "@/lib/types";
import { isRoundComplete } from "@/lib/draft-engine";
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
  const seat = draft.seats.find((s) => s.userId === user.id);
  if (!seat) redirect(`/draft/${draftId}`);

  const roundComplete = isRoundComplete(draft);

  return (
    <PickClient
      draftId={draftId}
      packCards={seat.currentPack?.cards ?? []}
      packNumber={draft.currentPack}
      pickInPack={seat.currentPack?.pickNumber ?? 0}
      totalCardsInPack={draft.cardsPerPack}
      picks={seat.pool}
      timerPreset={draft.timerPreset}
      pacingMode={draft.pacingMode}
      packsPerPlayer={draft.packsPerPlayer}
      reviewPeriodSeconds={draft.reviewPeriodSeconds}
      deckBuildingEnabled={draft.deckBuildingEnabled}
      isRoundComplete={roundComplete}
      currentPack={draft.currentPack}
      seats={draft.seats.map((s) => ({
        displayName: s.displayName,
        hasPicked: !s.currentPack || s.currentPack.cards.length === 0,
      }))}
    />
  );
}
