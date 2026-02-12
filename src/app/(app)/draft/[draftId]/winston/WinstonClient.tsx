"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { CardReference } from "@/lib/types";
import WinstonDraftScreen from "@/components/draft/WinstonDraftScreen";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { winstonLookAction, winstonTakeAction, winstonPassAction } from "../actions";

interface WinstonClientProps {
  draftId: string;
  piles: [CardReference[], CardReference[], CardReference[]];
  stackCount: number;
  activePile: number | null;
  isMyTurn: boolean;
  opponentName: string;
  myCards: CardReference[];
}

export default function WinstonClient({
  draftId,
  piles: initialPiles,
  stackCount: initialStackCount,
  activePile: initialActivePile,
  isMyTurn: initialIsMyTurn,
  opponentName,
  myCards: initialMyCards,
}: WinstonClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [revealedCards, setRevealedCards] = useState<CardReference[]>([]);

  // Subscribe to draft state changes
  useRealtimeChannel(
    `draft:${draftId}:winston`,
    (channel) => {
      channel
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "drafts",
            filter: `id=eq.${draftId}`,
          },
          (payload) => {
            const newStatus = (payload.new as { status?: string }).status;
            if (newStatus === "deck_building") {
              router.push(`/draft/${draftId}/deckbuild`);
            } else if (newStatus === "complete") {
              router.push(`/draft/${draftId}/results`);
            } else {
              setRevealedCards([]);
              router.refresh();
            }
          }
        )
        .subscribe();
    },
    [draftId]
  );

  const handleLookAtPile = useCallback(
    (pileIndex: number) => {
      startTransition(async () => {
        try {
          const cards = await winstonLookAction(draftId, pileIndex);
          setRevealedCards(cards);
        } catch {
          // Ignore
        }
      });
    },
    [draftId]
  );

  const handleTakePile = useCallback(() => {
    startTransition(async () => {
      try {
        await winstonTakeAction(draftId);
        setRevealedCards([]);
        router.refresh();
      } catch {
        // Ignore
      }
    });
  }, [draftId, router]);

  const handlePassPile = useCallback(() => {
    startTransition(async () => {
      try {
        await winstonPassAction(draftId);
        setRevealedCards([]);
        router.refresh();
      } catch {
        // Ignore
      }
    });
  }, [draftId, router]);

  return (
    <WinstonDraftScreen
      piles={initialPiles}
      stackCount={initialStackCount}
      activePile={revealedCards.length > 0 ? initialActivePile : null}
      revealedCards={revealedCards}
      isMyTurn={initialIsMyTurn}
      opponentName={opponentName}
      myCards={initialMyCards}
      onLookAtPile={handleLookAtPile}
      onTakePile={handleTakePile}
      onPassPile={handlePassPile}
    />
  );
}
