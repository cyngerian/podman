"use client";

import { useState, useEffect, useCallback, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import type {
  CardReference,
  PackFilterValue,
  TimerPreset,
  PacingMode,
  PodMemberStatus,
  BasicLandCounts,
} from "@/lib/types";
import { getPickTimer, getPassDirection } from "@/lib/types";
import PickScreen from "@/components/draft/PickScreen";
import WaitingScreen from "@/components/draft/WaitingScreen";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { createInFlightGuard } from "@/lib/async-guard";
import { createDeckSaver } from "@/lib/deck-saver";
import { makePickAction, autoPickAction, saveDeckAction } from "../actions";

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
  packReceivedAt: number | null;
  packQueueLength: number;
  podMembers: PodMemberStatus[];
  initialDeck: CardReference[] | null;
  initialSideboard: CardReference[] | null;
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
  packReceivedAt,
  packQueueLength,
  podMembers,
  initialDeck,
  initialSideboard,
}: PickClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Local state
  const [packCards, setPackCards] = useState(initialPackCards);
  const [picks, setPicks] = useState(initialPicks);
  const [filterSet, setFilterSet] = useState<Set<PackFilterValue>>(new Set());
  const [pickInFlight, setPickInFlight] = useState(false);
  const [deckSaveFailed, setDeckSaveFailed] = useState(false);

  // Single-flight guard: a second tap while a pick is in flight is dropped, so
  // the optimistic rollback can never restore state captured by a stale closure.
  const pickGuardRef = useRef<ReturnType<typeof createInFlightGuard> | null>(null);
  if (pickGuardRef.current == null) {
    pickGuardRef.current = createInFlightGuard(setPickInFlight);
  }

  const deckSaverRef = useRef<ReturnType<typeof createDeckSaver> | null>(null);
  if (deckSaverRef.current == null) {
    deckSaverRef.current = createDeckSaver({
      save: ({ deck, sideboard, lands }) =>
        saveDeckAction(draftId, deck, sideboard, lands),
      onFailedChange: setDeckSaveFailed,
    });
  }

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs timer to Realtime event, not a cascading render
      setTimerSeconds(computeRemaining());
    }
  }, [packReceivedAt, computeRemaining]);

  // Reset timer when pack card count changes (e.g. after server refresh)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs timer to server-driven pack change
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
      const guard = pickGuardRef.current!;
      if (guard.isBusy()) return;

      // Optimistic: pack passes to next player after picking
      const pickedCard = packCards.find((c) => c.scryfallId === cardId);
      const previousPackCards = packCards;
      const previousPicks = picks;
      if (pickedCard) {
        setPackCards([]); // Pack leaves — show "Waiting for next pack..."
        setPicks((prev) => [...prev, pickedCard]);
      }

      startTransition(async () => {
        await guard.run(async () => {
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
      });
    },
    [draftId, packCards, picks, router]
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

  const handleDeckChange = useCallback(
    (deck: CardReference[], sideboard: CardReference[], lands: BasicLandCounts) => {
      void deckSaverRef.current!.save({ deck, sideboard, lands });
    },
    []
  );

  const handleRetryDeckSave = useCallback(() => {
    void deckSaverRef.current!.retryLast();
  }, []);

  const passDirection = getPassDirection(initialPackNumber);

  const deckSaveNotice = deckSaveFailed ? (
    <div
      role="alert"
      className="fixed top-0 inset-x-0 z-[60] flex items-center justify-center gap-3 px-4 py-2 bg-red-600 text-white text-sm font-medium"
    >
      <span>Couldn&apos;t save your deck changes.</span>
      <button
        type="button"
        onClick={handleRetryDeckSave}
        className="px-2 py-1 rounded-md bg-white/20 hover:bg-white/30 transition-colors font-bold"
      >
        Retry
      </button>
      <button
        type="button"
        onClick={() => setDeckSaveFailed(false)}
        aria-label="Dismiss deck save error"
        className="px-2 py-1 rounded-md hover:bg-white/20 transition-colors"
      >
        &times;
      </button>
    </div>
  ) : null;

  // Waiting for pack
  if (packCards.length === 0) {
    return (
      <>
        {deckSaveNotice}
        <WaitingScreen
          podMembers={podMembers}
          passDirection={passDirection}
          picks={picks}
          onDeckChange={handleDeckChange}
          initialDeck={initialDeck}
          initialSideboard={initialSideboard}
        />
      </>
    );
  }

  return (
    <>
      {deckSaveNotice}
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
        pickDisabled={pickInFlight}
        filterSet={filterSet}
        onFilterToggle={handleFilterToggle}
        packQueueLength={packQueueLength}
        podMembers={podMembers}
        onDeckChange={handleDeckChange}
        initialDeck={initialDeck}
        initialSideboard={initialSideboard}
      />
    </>
  );
}
