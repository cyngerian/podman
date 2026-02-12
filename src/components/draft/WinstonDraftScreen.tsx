"use client";

import { useState } from "react";
import type { CardReference } from "@/lib/types";
import CardThumbnail from "@/components/ui/CardThumbnail";

interface WinstonDraftScreenProps {
  piles: [CardReference[], CardReference[], CardReference[]];
  stackCount: number;
  activePile: number | null;
  revealedCards: CardReference[];
  isMyTurn: boolean;
  opponentName: string;
  myCards: CardReference[];
  onLookAtPile: (pileIndex: number) => void;
  onTakePile: () => void;
  onPassPile: () => void;
}

/** The index of the next pile to examine when no pile is active. */
function getNextPileIndex(activePile: number | null): number {
  return activePile ?? 0;
}

function CardBack({ count }: { count: number }) {
  return (
    <div className="relative w-full card-aspect rounded-lg bg-gradient-to-br from-[#2e1065] to-[#1e3a5f] border border-border-light flex items-center justify-center select-none">
      <span className="text-3xl font-bold text-white/30">?</span>
      <span className="absolute top-1.5 right-1.5 min-w-5 h-5 flex items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white px-1">
        {count}
      </span>
    </div>
  );
}

export default function WinstonDraftScreen({
  piles,
  stackCount,
  activePile,
  revealedCards,
  isMyTurn,
  opponentName,
  myCards,
  onLookAtPile,
  onTakePile,
  onPassPile,
}: WinstonDraftScreenProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isExamining = isMyTurn && activePile !== null;
  const nextPile = getNextPileIndex(activePile);

  return (
    <div className="relative flex flex-col min-h-dvh bg-background text-foreground">
      {/* ---- Header ---- */}
      <header className="flex flex-col gap-1 px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight">Winston Draft</h1>
          <span className="text-xs text-foreground/50">
            Cards remaining: {stackCount}
          </span>
        </div>
        <p
          className={`text-sm font-medium ${
            isMyTurn ? "text-success" : "text-foreground/50"
          }`}
        >
          {isMyTurn ? "Your turn" : `Waiting for ${opponentName}...`}
        </p>
      </header>

      {/* ---- Piles Area ---- */}
      <section className="flex-1 flex flex-col items-center px-4 pt-6 pb-4 gap-6">
        <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
          {piles.map((pile, idx) => {
            // A pile was "passed" if the active pile is beyond this index
            const wasPassed = isMyTurn && activePile !== null && idx < activePile;
            const isNextToExamine =
              isMyTurn && !isExamining && idx === nextPile;

            return (
              <div key={idx} className="flex flex-col items-center gap-2">
                <div
                  className={`w-full transition-opacity duration-200 ${
                    wasPassed ? "opacity-40" : "opacity-100"
                  }`}
                >
                  <CardBack count={pile.length} />
                </div>

                <span className="text-[11px] text-foreground/40 font-medium">
                  Pile {idx + 1}
                </span>

                {isNextToExamine && (
                  <button
                    type="button"
                    onClick={() => onLookAtPile(idx)}
                    className="mt-1 px-4 py-1.5 rounded-md bg-accent text-white text-xs font-semibold hover:bg-accent-hover active:scale-95 transition-all"
                  >
                    LOOK
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* ---- Revealed Cards Area ---- */}
        {isExamining && revealedCards.length > 0 && (
          <div className="w-full max-w-sm flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <p className="text-xs font-medium text-foreground/60 text-center">
              Pile {activePile! + 1} &mdash; {revealedCards.length}{" "}
              {revealedCards.length === 1 ? "card" : "cards"}
            </p>

            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scrollbar-none">
              {revealedCards.map((card) => (
                <div
                  key={card.scryfallId}
                  className="flex-shrink-0 w-24 snap-start"
                >
                  <CardThumbnail card={card} size="medium" />
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onTakePile}
                className="flex-1 py-2.5 rounded-lg bg-success text-white text-sm font-bold hover:bg-success/90 active:scale-[0.97] transition-all"
              >
                TAKE PILE
              </button>
              <button
                type="button"
                onClick={onPassPile}
                className="flex-1 py-2.5 rounded-lg bg-surface-hover text-foreground/70 text-sm font-bold border border-border-light hover:bg-border active:scale-[0.97] transition-all"
              >
                PASS
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ---- Bottom Bar ---- */}
      <div className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur-sm px-4 py-3">
        <button
          type="button"
          onClick={() => setDrawerOpen((o) => !o)}
          className="w-full py-2 rounded-lg bg-surface text-foreground text-sm font-semibold border border-border-light hover:bg-surface-hover active:scale-[0.98] transition-all"
        >
          My Cards ({myCards.length})
        </button>
      </div>

      {/* ---- My Cards Drawer ---- */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer panel */}
          <div className="relative mt-auto max-h-[70dvh] bg-background border-t border-border rounded-t-2xl flex flex-col animate-in slide-in-from-bottom duration-200">
            {/* Handle + header */}
            <div className="flex flex-col items-center pt-2 pb-3 px-4 border-b border-border">
              <div className="w-10 h-1 rounded-full bg-border-light mb-3" />
              <div className="flex items-center justify-between w-full">
                <h2 className="text-sm font-bold">
                  My Cards ({myCards.length})
                </h2>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="text-foreground/50 hover:text-foreground text-xs font-medium"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Card grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {myCards.length === 0 ? (
                <p className="text-center text-foreground/40 text-sm py-8">
                  No cards collected yet.
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {myCards.map((card) => (
                    <CardThumbnail
                      key={card.scryfallId}
                      card={card}
                      size="small"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- Not-My-Turn Overlay ---- */}
      {!isMyTurn && (
        <div className="absolute inset-0 z-40 bg-black/40 flex items-center justify-center pointer-events-auto">
          <div className="bg-surface border border-border-light rounded-xl px-6 py-4 text-center shadow-xl">
            <p className="text-sm font-semibold text-foreground/70">
              Waiting for {opponentName}...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
