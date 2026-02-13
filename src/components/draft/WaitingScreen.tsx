"use client";

import { useState } from "react";
import type { CardReference, PodMemberStatus, PickedCardSortMode } from "@/lib/types";
import PodMemberList from "./PodMemberList";
import PickedCardsDrawer from "./PickedCardsDrawer";

interface WaitingScreenProps {
  podMembers: PodMemberStatus[];
  picks: CardReference[];
  sortMode: PickedCardSortMode;
  onSortChange: (mode: PickedCardSortMode) => void;
}

export default function WaitingScreen({
  podMembers,
  picks,
  sortMode,
  onSortChange,
}: WaitingScreenProps) {
  const [showPicks, setShowPicks] = useState(false);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-center px-4 h-12 border-b border-border">
        <p className="text-sm font-medium text-foreground/60">
          Waiting for next pack...
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-4 py-6 space-y-4">
          {/* Pod status */}
          <div>
            <h2 className="text-sm font-semibold text-foreground/50 uppercase tracking-wide mb-3">
              Pod
            </h2>
            <PodMemberList members={podMembers} />
          </div>

          {/* View picks button */}
          <button
            type="button"
            onClick={() => setShowPicks(true)}
            className="w-full py-3 rounded-xl bg-surface text-sm font-medium text-foreground hover:bg-surface-hover transition-colors border border-border"
          >
            View Picks ({picks.length})
          </button>
        </div>
      </div>

      {/* Picks drawer */}
      <PickedCardsDrawer
        picks={picks}
        isOpen={showPicks}
        onClose={() => setShowPicks(false)}
        sortMode={sortMode}
        onSortChange={onSortChange}
      />
    </div>
  );
}
