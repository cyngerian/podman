import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Draft } from "@/lib/types";
import { suggestLandCounts } from "@/lib/draft-engine";
import DeckBuildClient from "./DeckBuildClient";

export default async function DeckBuildPage({
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
    .select("id, status, state")
    .eq("id", draftId)
    .single();

  if (!dbDraft) notFound();
  if (dbDraft.status !== "deck_building") redirect(`/draft/${draftId}`);

  const draft = dbDraft.state as unknown as Draft;
  if (!draft) redirect(`/draft/${draftId}`);

  const seat = draft.seats.find((s) => s.userId === user.id);
  if (!seat) redirect(`/draft/${draftId}`);

  if (seat.hasSubmittedDeck) {
    // Already submitted — wait for others or redirect
    redirect(`/draft/${draftId}/results`);
  }

  const suggested = suggestLandCounts(seat.pool);

  return (
    <DeckBuildClient
      draftId={draftId}
      pool={seat.pool}
      initialDeck={seat.deck ?? undefined}
      initialSideboard={seat.sideboard ?? undefined}
      initialLands={seat.basicLands}
      suggestedLands={suggested}
    />
  );
}
