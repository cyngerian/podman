"use client";

import { useState, useEffect, useCallback, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import type {
  CardReference,
  PackFilterValue,
  PickedCardSortMode,
  TimerPreset,
  PacingMode,
} from "@/lib/types";
import { getPickTimer, getPassDirection } from "@/lib/types";
import PickScreen from "@/components/draft/PickScreen";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { makePickAction, autoPickAction } from "../actions";

interface PickClientProps {
  draftId: string;
  setCode: string | null;
  setName: string | null;
  startedAt: number | null;
  packCards: CardReference[];
  packNumber: number;
  pickInPack: number;
  totalCardsInPack: number;
  picks: CardReference[];
  timerPreset: TimerPreset;
  pacingMode: PacingMode;
  packsPerPlayer: number;
  deckBuildingEnabled: boolean;
  packReceivedAt: number | null;
  packQueueLength: number;
}

export default function PickClient({
  draftId,
  setCode,
  setName,
  startedAt,
  packCards: initialPackCards,
  packNumber: initialPackNumber,
  pickInPack: initialPickInPack,
  totalCardsInPack,
  picks: initialPicks,
  timerPreset,
  pacingMode,
  packsPerPlayer,
  deckBuildingEnabled,
  packReceivedAt,
  packQueueLength,
}: PickClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Local state
  const [packCards, setPackCards] = useState(initialPackCards);
  const [picks, setPicks] = useState(initialPicks);
  const [filterSet, setFilterSet] = useState<Set<PackFilterValue>>(new Set());
  const [sortMode, setSortMode] = useState<PickedCardSortMode>("draft_order");

  // Timer based on packReceivedAt
  const timerDuration =
    pacingMode === "realtime" && timerPreset !== "none"
      ? getPickTimer(packCards.length, timerPreset)
      : Infinity;

  const computeRemaining = useCallback(() => {
    if (pacingMode !== "realtime" || timerPreset === "none" || !packReceivedAt) {
      return Infinity;
    }
    const elapsed = (Date.now() - packReceivedAt) / 1000;
    const duration = getPickTimer(packCards.length, timerPreset);
    return Math.max(0, Math.ceil(duration - elapsed));
  }, [pacingMode, timerPreset, packReceivedAt, packCards.length]);

  const [timerSeconds, setTimerSeconds] = useState(computeRemaining);

  // Recalculate timer when packReceivedAt changes (new pack received)
  const prevPackReceivedAt = useRef(packReceivedAt);
  useEffect(() => {
    if (packReceivedAt !== prevPackReceivedAt.current) {
      prevPackReceivedAt.current = packReceivedAt;
      setTimerSeconds(computeRemaining());
    }
  }, [packReceivedAt, computeRemaining]);

  // Reset timer when pack card count changes (e.g. after server refresh)
  useEffect(() => {
    setTimerSeconds(computeRemaining());
  }, [packCards.length, computeRemaining]);

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

  // Poll for new pack when waiting (fallback for realtime gaps)
  useEffect(() => {
    if (packCards.length > 0) return;

    const interval = setInterval(() => {
      router.refresh();
    }, 2000);

    return () => clearInterval(interval);
  }, [packCards.length, router]);

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
      // Optimistic: pack passes to next player after picking
      const pickedCard = packCards.find((c) => c.scryfallId === cardId);
      const previousPackCards = packCards;
      const previousPicks = picks;
      if (pickedCard) {
        setPackCards([]); // Pack leaves — show "Waiting for next pack..."
        setPicks((prev) => [...prev, pickedCard]);
      }

      startTransition(async () => {
        try {
          await makePickAction(draftId, cardId);
          router.refresh();
        } catch {
          // Revert optimistic update on failure
          if (pickedCard) {
            setPackCards(previousPackCards);
            setPicks(previousPicks);
          }
        }
      });
    },
    [draftId, packCards, router]
  );

  const handleFilterToggle = useCallback((value: PackFilterValue | "all") => {
    if (value === "all") {
      setFilterSet(new Set());
    } else {
      setFilterSet((prev) => {
        const next = new Set(prev);
        if (next.has(value)) {
          next.delete(value);
        } else {
          // Creature and non-creature are mutually exclusive
          if (value === "creature") next.delete("noncreature");
          else if (value === "noncreature") next.delete("creature");
          next.add(value);
        }
        return next;
      });
    }
  }, []);

  const passDirection = getPassDirection(initialPackNumber);

  // Waiting for pack
  if (packCards.length === 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-foreground/60 text-sm">
            Waiting for next pack...
          </p>
        </div>
      </div>
    );
  }

  return (
    <PickScreen
      setCode={setCode}
      setName={setName}
      startedAt={startedAt}
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
      filterSet={filterSet}
      onFilterToggle={handleFilterToggle}
      sortMode={sortMode}
      onSortChange={setSortMode}
      packQueueLength={packQueueLength}
    />
  );
}
