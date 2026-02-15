"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { CardReference, BasicLandCounts, DraftPick } from "@/lib/types";
import { editDeckAction } from "../actions";
import PostDraftScreen from "@/components/draft/PostDraftScreen";

interface ResultsClientProps {
  draftId: string;
  pool: CardReference[];
  deck: CardReference[] | null;
  sideboard: CardReference[] | null;
  lands: BasicLandCounts | null;
  deckName?: string;
  pickHistory?: DraftPick[];
  allPlayersHistory?: Array<{
    playerName: string;
    picks: DraftPick[];
    avatarUrl?: string | null;
    favoriteColor?: string | null;
  }>;
}

export default function ResultsClient({
  draftId,
  pool,
  deck,
  sideboard,
  lands,
  deckName,
  pickHistory,
  allPlayersHistory,
}: ResultsClientProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const handleEditDeck = useCallback(async () => {
    if (editing) return;
    setEditing(true);
    try {
      await editDeckAction(draftId);
      router.push(`/draft/${draftId}/deckbuild`);
    } catch {
      setEditing(false);
    }
  }, [draftId, editing, router]);

  return (
    <PostDraftScreen
      pool={pool}
      deck={deck}
      sideboard={sideboard}
      lands={lands}
      initialDeckName={deckName}
      pickHistory={pickHistory}
      allPlayersHistory={allPlayersHistory}
      onEditDeck={handleEditDeck}
      editingDeck={editing}
    />
  );
}
