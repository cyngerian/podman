"use client";

import { useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { CardReference, BasicLandCounts } from "@/lib/types";
import DeckBuilderScreen from "@/components/deck-builder/DeckBuilderScreen";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { submitDeckAction, skipDeckBuildingAction, saveDeckAction } from "../actions";

interface DeckBuildClientProps {
  draftId: string;
  pool: CardReference[];
  initialDeck?: CardReference[];
  initialSideboard?: CardReference[];
  initialLands: BasicLandCounts;
  initialDeckName?: string;
}

export default function DeckBuildClient({
  draftId,
  pool,
  initialDeck,
  initialSideboard,
  initialLands,
  initialDeckName,
}: DeckBuildClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Subscribe to draft state changes
  useRealtimeChannel(
    `draft:${draftId}:deckbuild`,
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
            if (newStatus === "complete") {
              router.push(`/draft/${draftId}/results`);
            }
          }
        )
        .subscribe();
    },
    [draftId]
  );

  const handleSubmitDeck = useCallback(
    (deck: CardReference[], sideboard: CardReference[], lands: BasicLandCounts, deckName?: string) => {
      startTransition(async () => {
        try {
          await submitDeckAction(draftId, deck, sideboard, lands, deckName);
          router.push(`/draft/${draftId}/results`);
        } catch {
          // Error handling
        }
      });
    },
    [draftId, router]
  );

  const handleSkip = useCallback(() => {
    startTransition(async () => {
      try {
        await skipDeckBuildingAction(draftId);
        router.push(`/draft/${draftId}/results`);
      } catch {
        // Error handling
      }
    });
  }, [draftId, router]);

  const handleDeckChange = useCallback(
    (deck: CardReference[], sideboard: CardReference[], lands: BasicLandCounts, deckName?: string) => {
      saveDeckAction(draftId, deck, sideboard, lands, deckName).catch(() => {
        // Silent save failure — non-critical
      });
    },
    [draftId]
  );

  return (
    <DeckBuilderScreen
      pool={pool}
      initialDeck={initialDeck}
      initialSideboard={initialSideboard}
      initialLands={initialLands}
      initialDeckName={initialDeckName}
      onSubmitDeck={handleSubmitDeck}
      onSkip={handleSkip}
      onDeckChange={handleDeckChange}
    />
  );
}
