import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient, getUser } from "@/lib/supabase-server";
import type { Draft } from "@/lib/types";
import { isBotUserId } from "@/lib/bot-drafter";
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

  // Fetch profiles for avatar data
  const humanUserIds = draft.seats
    .filter((s) => !isBotUserId(s.userId))
    .map((s) => s.userId);
  const { data: profiles } = humanUserIds.length > 0
    ? await supabase
        .from("profiles")
        .select("id, avatar_url, favorite_color")
        .in("id", humanUserIds)
    : { data: [] };

  const profileMap: Record<string, { avatarUrl: string | null; favoriteColor: string | null }> = {};
  for (const p of profiles ?? []) {
    profileMap[p.id] = { avatarUrl: p.avatar_url, favoriteColor: p.favorite_color };
  }

  // Build all-players history if pick history is public
  const allPlayersHistory = draft.pickHistoryPublic
    ? draft.seats.map((s) => ({
        playerName: s.displayName,
        picks: s.picks,
        avatarUrl: profileMap[s.userId]?.avatarUrl ?? null,
        favoriteColor: profileMap[s.userId]?.favoriteColor ?? null,
      }))
    : undefined;

  return (
    <ResultsClient
      draftId={draftId}
      pool={seat.pool}
      deck={seat.deck}
      sideboard={seat.sideboard}
      lands={seat.basicLands}
      deckName={seat.deckName}
      pickHistory={seat.picks}
      allPlayersHistory={allPlayersHistory}
    />
  );
}
