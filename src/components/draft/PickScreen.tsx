"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { CardReference, PackFilterMode, PickedCardSortMode, ManaColor } from "@/lib/types";
import { MANA_COLORS } from "@/lib/types";
import CardThumbnail from "@/components/ui/CardThumbnail";
import Timer from "@/components/ui/Timer";
import PickedCardsDrawer from "./PickedCardsDrawer";
import Image from "next/image";

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
  packQueueLength?: number;
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

function getBorderClass(colors: string[]): string {
  if (colors.length === 0) return "card-border-C";
  if (colors.length > 1) return "card-border-M";
  return `card-border-${colors[0]}`;
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
  packQueueLength,
}: PickScreenProps) {
  const [selectedCard, setSelectedCard] = useState<CardReference | null>(null);
  const [showPickedDrawer, setShowPickedDrawer] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredCards = packCards.filter((card) => matchesFilter(card, filterMode));

  // Track active card in carousel via scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const scrollLeft = el.scrollLeft;
      const cardWidth = el.offsetWidth * 0.72; // matches w-[72vw]
      const gap = 12; // gap-3 = 12px
      const index = Math.round(scrollLeft / (cardWidth + gap));
      setActiveIndex(Math.min(index, filteredCards.length - 1));
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [filteredCards.length]);

  // Reset active index when filter changes
  useEffect(() => {
    setActiveIndex(0);
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
    }
  }, [filterMode]);

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

  const handleCarouselPick = useCallback(() => {
    const card = filteredCards[activeIndex];
    if (card) {
      onPick(card.scryfallId);
    }
  }, [filteredCards, activeIndex, onPick]);

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
            {!!packQueueLength && packQueueLength > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-accent text-white text-xs font-medium">
                +{packQueueLength} queued
              </span>
            )}
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

      {/* ==================== MOBILE: Carousel ==================== */}
      <div className="flex-1 flex flex-col min-h-0 sm:hidden">
        {filteredCards.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-foreground/40 text-sm">No cards match this filter</p>
          </div>
        ) : (
          <>
            {/* Carousel */}
            <div className="flex-1 flex items-center min-h-0">
              <div
                ref={scrollRef}
                className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth w-full px-[14vw] py-2 no-scrollbar"
              >
                {filteredCards.map((card) => (
                  <div
                    key={card.scryfallId}
                    className="snap-center shrink-0 w-[72vw] max-w-[320px]"
                  >
                    <div
                      className={`relative card-aspect rounded-xl overflow-hidden border-2 ${getBorderClass(card.colors)}`}
                    >
                      <Image
                        src={card.imageUri}
                        alt={card.name}
                        fill
                        sizes="72vw"
                        className="object-cover"
                        priority
                      />
                      {card.isFoil && (
                        <span className="absolute top-1 right-1 text-sm drop-shadow-md">
                          ✦
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Card counter + Pick button */}
            <div className="shrink-0 px-4 pb-2 pt-1 flex flex-col items-center gap-2">
              {/* Dot indicator */}
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-foreground/60">
                  {activeIndex + 1} / {filteredCards.length}
                </span>
              </div>

              {/* Card name */}
              {filteredCards[activeIndex] && (
                <p className="text-sm font-semibold text-foreground text-center leading-tight truncate max-w-full">
                  {filteredCards[activeIndex].name}
                </p>
              )}

              {/* Pick button */}
              <button
                type="button"
                onClick={handleCarouselPick}
                className="
                  w-full max-w-[320px] py-3 rounded-xl
                  bg-accent text-white font-bold text-base tracking-wide
                  active:scale-[0.97] transition-all duration-100
                  hover:bg-accent-hover
                "
              >
                PICK THIS CARD
              </button>
            </div>
          </>
        )}

        {/* Mobile bottom bar with filter */}
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

            {showFilterMenu && (
              <>
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
      </div>

      {/* ==================== DESKTOP: Grid ==================== */}
      <div className="hidden sm:flex flex-1 flex-col min-h-0">
        {/* Card grid — scrollable area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="grid grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-1.5 p-2">
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
          <div className="flex items-center gap-4 px-4 py-3">
            {selectedCard ? (
              <>
                <div className="relative w-20 card-aspect rounded-lg overflow-hidden shrink-0">
                  <Image
                    src={selectedCard.imageUri}
                    alt={selectedCard.name}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground truncate">
                    {selectedCard.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handlePick}
                  className="
                    px-6 py-2.5 rounded-xl shrink-0
                    bg-accent text-white font-bold text-sm tracking-wide
                    hover:bg-accent-hover active:scale-[0.97] transition-all duration-100
                  "
                >
                  PICK
                </button>
              </>
            ) : (
              <p className="text-sm text-foreground/40 w-full text-center py-2">
                Click a card to select it, double-click to pick immediately
              </p>
            )}
          </div>
        </div>

        {/* Desktop bottom bar with filter */}
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

            {showFilterMenu && (
              <>
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
