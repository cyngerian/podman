"use client";

import { useState } from "react";
import Link from "next/link";
import type { CardReference, PodMemberStatus, BasicLandCounts, PassDirection } from "@/lib/types";
import PodMemberList from "./PodMemberList";
import DeckBuilderScreen from "@/components/deck-builder/DeckBuilderScreen";

interface WaitingScreenProps {
  podMembers: PodMemberStatus[];
  passDirection: PassDirection;
  picks: CardReference[];
  onDeckChange?: (deck: CardReference[], sideboard: CardReference[], lands: BasicLandCounts) => void;
  initialDeck?: CardReference[] | null;
  initialSideboard?: CardReference[] | null;
}

export default function WaitingScreen({
  podMembers,
  passDirection,
  picks,
  onDeckChange,
  initialDeck,
  initialSideboard,
}: WaitingScreenProps) {
  const [showDeckBuilder, setShowDeckBuilder] = useState(false);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center px-4 h-12 border-b border-border">
        <Link href="/dashboard" className="text-xl font-bold tracking-tight text-foreground shrink-0">
          podman
        </Link>
        <p className="flex-1 text-sm font-medium text-foreground/60 text-center">
          Waiting for next pack...
        </p>
        <div className="w-16 shrink-0" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-4 py-6 space-y-4">
          {/* Pod status */}
          <div>
            <h2 className="text-sm font-semibold text-foreground/50 uppercase tracking-wide mb-3">
              Pod
            </h2>
            <PodMemberList members={podMembers} passDirection={passDirection} />
          </div>

          {/* View deck button */}
          <button
            type="button"
            onClick={() => setShowDeckBuilder(true)}
            className="w-full py-3 rounded-xl bg-surface text-sm font-medium text-foreground hover:bg-surface-hover transition-colors border border-border"
          >
            My Deck
          </button>
        </div>
      </div>

      {/* Deck builder overlay */}
      {showDeckBuilder && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <DeckBuilderScreen
            mode="midDraft"
            pool={picks}
            initialDeck={initialDeck ?? undefined}
            initialSideboard={initialSideboard ?? undefined}
            onDeckChange={onDeckChange ? (deck, sideboard, lands) => onDeckChange(deck, sideboard, lands) : undefined}
            onClose={() => setShowDeckBuilder(false)}
          />
        </div>
      )}
    </div>
  );
}
