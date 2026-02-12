"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  CardReference,
  PackFilterMode,
  PickedCardSortMode,
  TimerPreset,
  PacingMode,
} from "@/lib/types";
import { getPickTimer, getPassDirection } from "@/lib/types";
import PickScreen from "@/components/draft/PickScreen";
import BetweenPackScreen from "@/components/draft/BetweenPackScreen";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { makePickAction, autoPickAction } from "../actions";

interface PickClientProps {
  draftId: string;
  packCards: CardReference[];
  packNumber: number;
  pickInPack: number;
  totalCardsInPack: number;
  picks: CardReference[];
  timerPreset: TimerPreset;
  pacingMode: PacingMode;
  packsPerPlayer: number;
  reviewPeriodSeconds: number;
  deckBuildingEnabled: boolean;
  isRoundComplete: boolean;
  currentPack: number;
  seats: Array<{ displayName: string; hasPicked: boolean }>;
}

export default function PickClient({
  draftId,
  packCards: initialPackCards,
  packNumber: initialPackNumber,
  pickInPack: initialPickInPack,
  totalCardsInPack,
  picks: initialPicks,
  timerPreset,
  pacingMode,
  packsPerPlayer,
  reviewPeriodSeconds,
  deckBuildingEnabled,
  isRoundComplete: initialRoundComplete,
  currentPack: initialCurrentPack,
  seats: initialSeats,
}: PickClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Local state
  const [packCards, setPackCards] = useState(initialPackCards);
  const [picks, setPicks] = useState(initialPicks);
  const [filterMode, setFilterMode] = useState<PackFilterMode>("all");
  const [sortMode, setSortMode] = useState<PickedCardSortMode>("draft_order");
  const [showBetweenPack, setShowBetweenPack] = useState(initialRoundComplete);
  const [reviewTimer, setReviewTimer] = useState(reviewPeriodSeconds);

  // Timer
  const timerDuration =
    pacingMode === "realtime" && timerPreset !== "none"
      ? getPickTimer(packCards.length, timerPreset)
      : Infinity;
  const [timerSeconds, setTimerSeconds] = useState(timerDuration);

  // Reset timer when pack changes
  useEffect(() => {
    if (pacingMode === "realtime" && timerPreset !== "none") {
      const duration = getPickTimer(packCards.length, timerPreset);
      setTimerSeconds(duration);
    }
  }, [packCards.length, pacingMode, timerPreset]);

  // Countdown timer
  useEffect(() => {
    if (
      pacingMode !== "realtime" ||
      timerPreset === "none" ||
      timerSeconds <= 0 ||
      packCards.length === 0
    ) {
      return;
    }

    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          // Auto-pick when timer expires
          startTransition(async () => {
            try {
              await autoPickAction(draftId);
              router.refresh();
            } catch {
              // Ignore — draft may have already advanced
            }
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [pacingMode, timerPreset, timerSeconds, packCards.length, draftId, router]);

  // Between-pack review timer
  useEffect(() => {
    if (!showBetweenPack) return;

    const interval = setInterval(() => {
      setReviewTimer((prev) => {
        if (prev <= 1) {
          setShowBetweenPack(false);
          return reviewPeriodSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showBetweenPack, reviewPeriodSeconds]);

  // Subscribe to draft state changes
  useRealtimeChannel(
    `draft:${draftId}:pick`,
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
              // State updated — refresh to get new data
              router.refresh();
            }
          }
        )
        .subscribe();
    },
    [draftId]
  );

  const handlePick = useCallback(
    (cardId: string) => {
      // Optimistic: remove card from local state
      const pickedCard = packCards.find((c) => c.scryfallId === cardId);
      if (pickedCard) {
        setPackCards((prev) => prev.filter((c) => c.scryfallId !== cardId));
        setPicks((prev) => [...prev, pickedCard]);
      }

      startTransition(async () => {
        try {
          await makePickAction(draftId, cardId);
          router.refresh();
        } catch {
          // Revert optimistic update on failure
          if (pickedCard) {
            setPackCards((prev) => [...prev, pickedCard]);
            setPicks((prev) => prev.filter((c) => c.scryfallId !== pickedCard.scryfallId));
          }
        }
      });
    },
    [draftId, packCards, router]
  );

  const passDirection = getPassDirection(initialPackNumber);

  // Between-pack screen
  if (showBetweenPack && packCards.length === 0) {
    return (
      <BetweenPackScreen
        completedPackNumber={initialCurrentPack}
        nextPackNumber={initialCurrentPack + 1}
        reviewSecondsRemaining={reviewTimer}
        picks={picks}
        players={initialSeats.map((s) => ({
          name: s.displayName,
          ready: s.hasPicked,
        }))}
      />
    );
  }

  // Waiting for pack (all picked, waiting for others)
  if (packCards.length === 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-foreground/60 text-sm">
            Waiting for other players to pick...
          </p>
        </div>
      </div>
    );
  }

  return (
    <PickScreen
      packCards={packCards}
      packNumber={initialPackNumber}
      pickInPack={initialPickInPack}
      totalCardsInPack={totalCardsInPack}
      passDirection={passDirection}
      timerSeconds={timerSeconds}
      timerMaxSeconds={timerDuration === Infinity ? 0 : timerDuration}
      timerPaused={isPending}
      picks={picks}
      onPick={handlePick}
      filterMode={filterMode}
      onFilterChange={setFilterMode}
      sortMode={sortMode}
      onSortChange={setSortMode}
    />
  );
}
