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
  pickHistory?: DraftPick[];
  allPlayersHistory?: Array<{
    playerName: string;
    picks: DraftPick[];
  }>;
}

export default function ResultsClient({
  draftId,
  pool,
  deck,
  sideboard,
  lands,
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
      pickHistory={pickHistory}
      allPlayersHistory={allPlayersHistory}
      onEditDeck={handleEditDeck}
      editingDeck={editing}
    />
  );
}
