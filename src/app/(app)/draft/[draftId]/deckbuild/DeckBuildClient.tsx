"use client";

import { useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { CardReference, BasicLandCounts } from "@/lib/types";
import DeckBuilderScreen from "@/components/deck-builder/DeckBuilderScreen";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { submitDeckAction, skipDeckBuildingAction } from "../actions";

interface DeckBuildClientProps {
  draftId: string;
  pool: CardReference[];
  initialDeck?: CardReference[];
  initialSideboard?: CardReference[];
  initialLands: BasicLandCounts;
  suggestedLands: BasicLandCounts;
}

export default function DeckBuildClient({
  draftId,
  pool,
  initialDeck,
  initialSideboard,
  initialLands,
  suggestedLands,
}: DeckBuildClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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
    (deck: CardReference[], sideboard: CardReference[], lands: BasicLandCounts) => {
      startTransition(async () => {
        try {
          await submitDeckAction(draftId, deck, sideboard, lands);
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

  return (
    <DeckBuilderScreen
      pool={pool}
      initialDeck={initialDeck}
      initialSideboard={initialSideboard}
      initialLands={initialLands}
      suggestedLands={suggestedLands}
      onSubmitDeck={handleSubmitDeck}
      onSkip={handleSkip}
    />
  );
}
