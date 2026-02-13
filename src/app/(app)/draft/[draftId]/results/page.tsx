import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient, getUser } from "@/lib/supabase-server";
import type { Draft } from "@/lib/types";
import ResultsClient from "./ResultsClient";

export default async function ResultsPage({
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
    .select("id, status, state")
    .eq("id", draftId)
    .single();

  if (!dbDraft) notFound();

  // Allow viewing results if deck_building (user submitted) or complete
  if (dbDraft.status !== "complete" && dbDraft.status !== "deck_building") {
    redirect(`/draft/${draftId}`);
  }

  const draft = dbDraft.state as unknown as Draft;
  if (!draft) redirect(`/draft/${draftId}`);

  const seat = draft.seats.find((s) => s.userId === user.id);
  if (!seat) redirect(`/draft/${draftId}`);

  // Build all-players history if pick history is public
  const allPlayersHistory = draft.pickHistoryPublic
    ? draft.seats.map((s) => ({
        playerName: s.displayName,
        picks: s.picks,
      }))
    : undefined;

  return (
    <ResultsClient
      draftId={draftId}
      pool={seat.pool}
      deck={seat.deck}
      sideboard={seat.sideboard}
      lands={seat.basicLands}
      pickHistory={seat.picks}
      allPlayersHistory={allPlayersHistory}
    />
  );
}
