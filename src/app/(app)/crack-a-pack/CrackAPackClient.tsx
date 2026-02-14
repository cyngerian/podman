"use client";

import { useState, useTransition, useCallback } from "react";
import SetPicker from "@/components/draft/SetPicker";
import PickScreen from "@/components/draft/PickScreen";
import { crackAPackAction } from "./actions";
import type { CardReference } from "@/lib/types";

export default function CrackAPackClient() {
  const [selectedSet, setSelectedSet] = useState<{ code: string; name: string } | null>(null);
  const [packCards, setPackCards] = useState<CardReference[] | null>(null);
  const [packKey, setPackKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const crackPack = useCallback(
    (setCode: string) => {
      setError(null);
      startTransition(async () => {
        const result = await crackAPackAction(setCode);
        if ("error" in result) {
          setError(result.error);
        } else {
          setPackCards(result.cards);
          setPackKey((k) => k + 1);
        }
      });
    },
    [],
  );

  const handleCrack = useCallback(() => {
    if (selectedSet) crackPack(selectedSet.code);
  }, [selectedSet, crackPack]);

  const handleCrackAnother = useCallback(() => {
    if (selectedSet) crackPack(selectedSet.code);
  }, [selectedSet, crackPack]);

  const handleBackToSetPicker = useCallback(() => {
    setPackCards(null);
    setError(null);
  }, []);

  // Pack view
  if (packCards && selectedSet) {
    return (
      <PickScreen
        key={packKey}
        setCode={selectedSet.code}
        setName={selectedSet.name}
        startedAt={null}
        packCards={packCards}
        packNumber={1}
        pickInPack={1}
        totalCardsInPack={packCards.length}
        passDirection="left"
        timerSeconds={0}
        timerMaxSeconds={0}
        picks={[]}
        onPick={() => {}}
        filterSet={new Set()}
        onFilterToggle={() => {}}
        podMembers={[]}
        crackAPack
        onCrackAnother={handleCrackAnother}
        onBackToSetPicker={handleBackToSetPicker}
        crackAPackLoading={isPending}
      />
    );
  }

  // Set selection view
  return (
    <div className="mx-auto max-w-md px-4 py-10 space-y-6">
      <h1 className="text-2xl font-bold text-center">Crack a Pack</h1>
      <p className="text-sm text-foreground/50 text-center">
        Pick a set and open a booster pack to browse the cards.
      </p>

      <div className="space-y-4">
        <SetPicker value={selectedSet} onChange={setSelectedSet} />

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}

        <button
          type="button"
          onClick={handleCrack}
          disabled={!selectedSet || isPending}
          className="block w-full rounded-lg bg-accent px-3 py-3 text-sm font-bold text-white hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? "Opening pack..." : "Crack it!"}
        </button>
      </div>
    </div>
  );
}
