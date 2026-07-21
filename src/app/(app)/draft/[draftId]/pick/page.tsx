import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient, getUser } from "@/lib/supabase-server";
import { hydrateCardTypeLines } from "@/lib/scryfall";
import { isBotUserId } from "@/lib/bot-drafter";
import {
  buildPodMembers,
  expandCardKeys,
  type DraftPickView,
  type PodProfile,
} from "@/lib/draft-view";
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

  // Narrow read: only this viewer's seat + per-seat counts, never the full
  // drafts.state JSON (see src/lib/draft-view.ts for why).
  const { data } = await supabase.rpc("get_draft_pick_view", {
    p_draft_id: draftId,
  });

  const view = data as unknown as DraftPickView | null;

  if (!view) notFound();
  if (view.status !== "active") redirect(`/draft/${draftId}`);

  // Only the caller's seat comes back from the RPC (never other players' packs)
  const seat = view.seat;
  if (!seat) redirect(`/draft/${draftId}`);

  // Fetch profile avatars for real (non-bot) users
  const humanUserIds = view.podMembers
    .map((m) => m.userId)
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

  const profileMap = new Map<string, PodProfile>(
    profileRows.map((p) => [p.id, {
      avatarUrl: p.avatar_url as string | null,
      favoriteColor: p.favorite_color as string | null,
    }])
  );

  const podMembers = buildPodMembers(view.podMembers, profileMap, user.id);

  // deck/sideboard arrive as keys into the pool — expand them back to cards
  const pool = seat.pool ?? [];

  return (
    <PickClient
      key={seat.packReceivedAt ?? "waiting"}
      draftId={draftId}
      setCode={view.setCode}
      setName={view.setName}
      startedAt={view.startedAt}
      packCards={packCards}
      packNumber={seat.currentPack?.round ?? view.currentPack}
      pickInPack={seat.currentPack?.pickNumber ?? 0}
      totalCardsInPack={view.cardsPerPack}
      picks={pool}
      timerPreset={view.timerPreset}
      pacingMode={view.pacingMode}
      packReceivedAt={seat.packReceivedAt}
      packQueueLength={seat.packQueueLength}
      podMembers={podMembers}
      initialDeck={expandCardKeys(pool, seat.deckKeys)}
      initialSideboard={expandCardKeys(pool, seat.sideboardKeys)}
    />
  );
}
