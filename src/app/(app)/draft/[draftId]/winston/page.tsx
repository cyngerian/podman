import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Draft } from "@/lib/types";
import WinstonClient from "./WinstonClient";

export default async function WinstonPage({
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
  if (dbDraft.status !== "active") redirect(`/draft/${draftId}`);

  const draft = dbDraft.state as unknown as Draft;
  if (!draft || !draft.winstonState) redirect(`/draft/${draftId}`);

  const seat = draft.seats.find((s) => s.userId === user.id);
  if (!seat) redirect(`/draft/${draftId}`);

  const isMyTurn =
    draft.seats[draft.winstonState.activePlayerIndex]?.userId === user.id;
  const opponent = draft.seats.find((s) => s.userId !== user.id);

  return (
    <WinstonClient
      draftId={draftId}
      piles={draft.winstonState.piles}
      stackCount={draft.winstonState.stack.length}
      activePile={draft.winstonState.activePile}
      isMyTurn={isMyTurn}
      opponentName={opponent?.displayName ?? "Opponent"}
      myCards={seat.pool}
    />
  );
}
