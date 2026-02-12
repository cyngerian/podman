"use client";

import { useState, useCallback } from "react";
import type { CardReference, PackFilterMode, PickedCardSortMode, ManaColor } from "@/lib/types";
import { MANA_COLORS } from "@/lib/types";
import CardThumbnail from "@/components/ui/CardThumbnail";
import CardPreview from "@/components/ui/CardPreview";
import Timer from "@/components/ui/Timer";
import PickedCardsDrawer from "./PickedCardsDrawer";

interface PickScreenProps {
  packCards: CardReference[];
  packNumber: number;
  pickInPack: number;
  totalCardsInPack: number;
  passDirection: "left" | "right";
  timerSeconds: number;
  timerMaxSeconds: number;
  timerPaused?: boolean;
  picks: CardReference[];
  onPick: (cardId: string) => void;
  filterMode: PackFilterMode;
  onFilterChange: (mode: PackFilterMode) => void;
  sortMode: PickedCardSortMode;
  onSortChange: (mode: PickedCardSortMode) => void;
}

const FILTER_OPTIONS: { value: PackFilterMode; label: string; colorVar?: string }[] = [
  { value: "all", label: "All" },
  { value: "W", label: "W", colorVar: "var(--mana-white)" },
  { value: "U", label: "U", colorVar: "var(--mana-blue)" },
  { value: "B", label: "B", colorVar: "var(--mana-black)" },
  { value: "R", label: "R", colorVar: "var(--mana-red)" },
  { value: "G", label: "G", colorVar: "var(--mana-green)" },
  { value: "multicolor", label: "Multi", colorVar: "var(--mana-gold)" },
  { value: "colorless", label: "C", colorVar: "var(--mana-colorless)" },
];

function matchesFilter(card: CardReference, filter: PackFilterMode): boolean {
  if (filter === "all") return true;
  if (filter === "colorless") return card.colors.length === 0;
  if (filter === "multicolor") return card.colors.length >= 2;
  return card.colors.includes(filter as ManaColor);
}

export default function PickScreen({
  packCards,
  packNumber,
  pickInPack,
  totalCardsInPack,
  passDirection,
  timerSeconds,
  timerMaxSeconds,
  timerPaused,
  picks,
  onPick,
  filterMode,
  onFilterChange,
  sortMode,
  onSortChange,
}: PickScreenProps) {
  const [selectedCard, setSelectedCard] = useState<CardReference | null>(null);
  const [showPickedDrawer, setShowPickedDrawer] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const filteredCards = packCards.filter((card) => matchesFilter(card, filterMode));

  const handleCardClick = useCallback((card: CardReference) => {
    setSelectedCard(card);
  }, []);

  const handleQuickPick = useCallback(
    (card: CardReference) => {
      onPick(card.scryfallId);
    },
    [onPick],
  );

  const handlePick = useCallback(() => {
    if (selectedCard) {
      onPick(selectedCard.scryfallId);
      setSelectedCard(null);
    }
  }, [selectedCard, onPick]);

  const directionArrow = passDirection === "left" ? "\u2190" : "\u2192";

  return (
    <div className="flex flex-col h-dvh bg-background">
      {/* Header bar */}
      <header className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <Timer
          seconds={timerSeconds}
          maxSeconds={timerMaxSeconds}
          paused={timerPaused}
        />

        <div className="flex flex-col items-center">
          <span className="text-sm font-semibold text-foreground">
            Pack {packNumber} Pick {pickInPack}
            <span className="text-foreground/40 font-normal ml-1.5">
              {packCards.length}/{totalCardsInPack}
            </span>
          </span>
          <span className="text-xs text-foreground/50">
            {directionArrow} Pass {passDirection}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowPickedDrawer(true)}
          className="px-2.5 py-1.5 rounded-lg bg-surface text-xs font-medium text-foreground hover:bg-surface-hover transition-colors border border-border"
        >
          Picks ({picks.length})
        </button>
      </header>

      {/* Card grid — scrollable area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="grid grid-cols-3 gap-1.5 p-2 sm:grid-cols-4">
          {filteredCards.map((card) => (
            <CardThumbnail
              key={card.scryfallId}
              card={card}
              selected={selectedCard?.scryfallId === card.scryfallId}
              onClick={() => handleCardClick(card)}
              onDoubleClick={() => handleQuickPick(card)}
            />
          ))}
        </div>

        {filteredCards.length === 0 && (
          <p className="text-center text-foreground/40 text-sm py-8">
            No cards match this filter
          </p>
        )}
      </div>

      {/* Preview panel */}
      <div className="shrink-0 border-t border-border bg-surface">
        <CardPreview
          card={selectedCard}
          onPick={handlePick}
          showPickButton={!!selectedCard}
          onClose={selectedCard ? () => setSelectedCard(null) : undefined}
        />
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-end px-3 py-2 border-t border-border bg-surface shrink-0">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowFilterMenu((prev) => !prev)}
            className={`
              px-3 py-2 rounded-lg text-sm font-medium transition-colors
              ${filterMode !== "all"
                ? "bg-accent text-white"
                : "bg-background text-foreground hover:bg-surface-hover"
              }
            `}
          >
            Filter{filterMode !== "all" ? ` (${filterMode})` : ""}
          </button>

          {/* Filter dropdown */}
          {showFilterMenu && (
            <>
              {/* Backdrop to close */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowFilterMenu(false)}
              />
              <div className="absolute bottom-full right-0 mb-2 z-50 bg-surface border border-border rounded-xl p-2 shadow-lg min-w-[200px]">
                <div className="grid grid-cols-4 gap-1.5">
                  {FILTER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        onFilterChange(opt.value);
                        setShowFilterMenu(false);
                      }}
                      className={`
                        flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-xs font-semibold
                        transition-colors
                        ${filterMode === opt.value
                          ? "bg-accent text-white"
                          : "bg-background text-foreground/70 hover:bg-surface-hover"
                        }
                      `}
                    >
                      {opt.colorVar && (
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: opt.colorVar }}
                        />
                      )}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Picked cards drawer */}
      <PickedCardsDrawer
        picks={picks}
        isOpen={showPickedDrawer}
        onClose={() => setShowPickedDrawer(false)}
        sortMode={sortMode}
        onSortChange={onSortChange}
      />
    </div>
  );
}
