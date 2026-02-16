"use client";

import { useState, useMemo } from "react";
import type { CardReference, PickedCardSortMode, ManaColor } from "@/lib/types";
import { rarityRank } from "@/lib/card-utils";
import CardThumbnail from "@/components/ui/CardThumbnail";
import CardPreview from "@/components/ui/CardPreview";

interface PickedCardsDrawerProps {
  picks: CardReference[];
  isOpen: boolean;
  onClose: () => void;
  sortMode: PickedCardSortMode;
  onSortChange: (mode: PickedCardSortMode) => void;
}

const SORT_OPTIONS: { value: PickedCardSortMode; label: string }[] = [
  { value: "draft_order", label: "Draft Order" },
  { value: "color", label: "Color" },
  { value: "cmc", label: "CMC" },
  { value: "rarity", label: "Rarity" },
];

const COLOR_ORDER: (ManaColor | "multicolor" | "colorless")[] = [
  "W", "U", "B", "R", "G", "multicolor", "colorless",
];

function getColorGroup(card: CardReference): ManaColor | "multicolor" | "colorless" {
  if (card.colors.length === 0) return "colorless";
  if (card.colors.length > 1) return "multicolor";
  return card.colors[0];
}

function sortPicks(picks: CardReference[], mode: PickedCardSortMode): CardReference[] {
  const sorted = [...picks];
  switch (mode) {
    case "draft_order":
      return sorted;
    case "color":
      return sorted.sort((a, b) => {
        const aIdx = COLOR_ORDER.indexOf(getColorGroup(a));
        const bIdx = COLOR_ORDER.indexOf(getColorGroup(b));
        if (aIdx !== bIdx) return aIdx - bIdx;
        return a.cmc - b.cmc;
      });
    case "cmc":
      return sorted.sort((a, b) => a.cmc - b.cmc);
    case "rarity":
      return sorted.sort((a, b) =>
        rarityRank(a.rarity) - rarityRank(b.rarity) ||
        a.cmc - b.cmc
      );
    default:
      return sorted;
  }
}

export default function PickedCardsDrawer({
  picks,
  isOpen,
  onClose,
  sortMode,
  onSortChange,
}: PickedCardsDrawerProps) {
  const [previewCard, setPreviewCard] = useState<CardReference | null>(null);

  const sortedPicks = useMemo(() => sortPicks(picks, sortMode), [picks, sortMode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="relative mt-2 flex-1 flex flex-col bg-surface rounded-t-2xl overflow-hidden drawer-enter drawer-enter-active">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-lg font-bold text-foreground">
            My Picks ({picks.length})
          </h2>

          <div className="flex items-center gap-3">
            <select
              value={sortMode}
              onChange={(e) => onSortChange(e.target.value as PickedCardSortMode)}
              className="bg-background text-foreground text-sm rounded-lg px-2 py-1.5 border border-border focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-foreground/60 hover:text-foreground hover:bg-surface-hover transition-colors"
              aria-label="Close drawer"
            >
              <XIcon />
            </button>
          </div>
        </div>

        {/* Card grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {sortedPicks.length === 0 ? (
            <p className="text-center text-foreground/40 text-sm py-8">
              No picks yet
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
              {sortedPicks.map((card, idx) => (
                <CardThumbnail
                  key={`${card.scryfallId}-${idx}`}
                  card={card}
                  size="medium"
                  onClick={() => setPreviewCard(card)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Full-image preview modal */}
      {previewCard && (
        <div className="fixed inset-0 z-60 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setPreviewCard(null)}
          />
          <div className="relative z-10 w-full max-w-sm mx-4 bg-surface rounded-2xl overflow-hidden">
            <CardPreview
              card={previewCard}
              showPickButton={false}
              onClose={() => setPreviewCard(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function XIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-5 h-5"
    >
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  );
}
