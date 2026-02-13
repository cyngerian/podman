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
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const nameRef = useRef<HTMLParagraphElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const scrubThumbRef = useRef<HTMLDivElement>(null);

  const filteredCards = packCards.filter((card) => matchesFilter(card, filterMode));

  // Card dimensions for carousel
  const CARD_WIDTH_VW = 72; // base card width
  const CARD_OVERLAP_PX = -35; // base negative margin for overlap
  const SCROLL_ACTIVE_SCALE = 1.15; // center card pops up large
  const SCROLL_INACTIVE_SCALE = 0.55; // distant cards shrink significantly
  const CARD_PULL_PX = 28; // max translateX pull toward center per distance unit

  // Track active card + apply scale transforms based on scroll position.
  // Uses rAF polling loop for perfect sync with display refresh (fixes 120Hz flicker).
  const activeIndexRef = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let rafId = 0;
    let running = true;
    let isTouching = false;
    let isSnapping = false;
    let lastScrollLeft = -1;
    let idleFrames = 0;
    const SNAP_IDLE_FRAMES = 12; // ~100ms at 120Hz

    // Cache layout values — none of these change during scroll
    const halfContainer = el.offsetWidth / 2;
    const maxDist = el.offsetWidth * 0.45;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const scaleRange = SCROLL_ACTIVE_SCALE - SCROLL_INACTIVE_SCALE;
    const cardCenters: number[] = [];
    cardRefs.current.forEach((cardEl) => {
      if (!cardEl) { cardCenters.push(0); return; }
      cardCenters.push(cardEl.offsetLeft + cardEl.offsetWidth / 2);
    });

    const updateCards = (scrollLeft: number) => {
      const containerCenter = scrollLeft + halfContainer;
      let closestIdx = 0;
      let closestDist = Infinity;

      for (let i = 0; i < cardRefs.current.length; i++) {
        const cardEl = cardRefs.current[i];
        if (!cardEl) continue;
        const cardCenter = cardCenters[i];
        const dist = Math.abs(containerCenter - cardCenter);
        const t = Math.min(dist / maxDist, 1);
        const scale = Math.round((SCROLL_ACTIVE_SCALE - t * scaleRange) * 1000) / 1000;
        const pull = dist < 1 ? 0 : Math.round(Math.sign(containerCenter - cardCenter) * t * CARD_PULL_PX * 10) / 10;

        const inner = cardEl.firstElementChild as HTMLElement | null;
        if (inner) {
          inner.style.transform = `translate3d(${pull}px,0,0) scale3d(${scale},${scale},1)`;
        }

        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      }

      // Update zIndex + UI text only when active card changes
      if (closestIdx !== activeIndexRef.current) {
        activeIndexRef.current = closestIdx;
        for (let i = 0; i < cardRefs.current.length; i++) {
          const cardEl = cardRefs.current[i];
          if (cardEl) cardEl.style.zIndex = `${100 - Math.abs(i - closestIdx) * 10}`;
        }
        if (counterRef.current) counterRef.current.textContent = `${closestIdx + 1} / ${filteredCards.length}`;
        if (nameRef.current) nameRef.current.textContent = filteredCards[closestIdx]?.name ?? "";
      }

      // Update scrub bar position
      if (scrubThumbRef.current && maxScroll > 0) {
        const progress = scrollLeft / maxScroll;
        scrubThumbRef.current.style.left = `${progress * 100}%`;
      }
    };

    const snapToNearest = () => {
      const containerCenter = el.scrollLeft + halfContainer;
      let closestOffset = el.scrollLeft;
      let closestDist = Infinity;

      for (let i = 0; i < cardCenters.length; i++) {
        const dist = Math.abs(containerCenter - cardCenters[i]);
        if (dist < closestDist) {
          closestDist = dist;
          closestOffset = cardCenters[i] - halfContainer;
        }
      }

      if (closestDist < 3) return;
      isSnapping = true;
      el.scrollTo({ left: closestOffset, behavior: "smooth" });
      setTimeout(() => { isSnapping = false; }, 350);
    };

    // Continuous rAF loop — checks scrollLeft every frame for perfect
    // display sync. Only does work when scroll position actually changed.
    const tick = () => {
      if (!running) return;
      const scrollLeft = el.scrollLeft;
      if (scrollLeft !== lastScrollLeft) {
        lastScrollLeft = scrollLeft;
        idleFrames = 0;
        updateCards(scrollLeft);
      } else if (!isTouching && !isSnapping) {
        idleFrames++;
        if (idleFrames === SNAP_IDLE_FRAMES) {
          snapToNearest();
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    const onTouchStart = () => {
      isTouching = true;
      isSnapping = false;
      idleFrames = 0;
    };
    const onTouchEnd = () => {
      isTouching = false;
      idleFrames = 0;
    };

    // Initial state
    updateCards(el.scrollLeft);
    lastScrollLeft = el.scrollLeft;
    for (let i = 0; i < cardRefs.current.length; i++) {
      const cardEl = cardRefs.current[i];
      if (cardEl) cardEl.style.zIndex = `${100 - Math.abs(i - activeIndexRef.current) * 10}`;
    }

    // Start rAF loop + touch listeners
    rafId = requestAnimationFrame(tick);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [filteredCards.length]);

  // Reset active index when filter changes
  useEffect(() => {
    activeIndexRef.current = 0;
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
    if (counterRef.current) counterRef.current.textContent = `1 / ${filteredCards.length}`;
    if (nameRef.current) nameRef.current.textContent = filteredCards[0]?.name ?? "";
  }, [filterMode, filteredCards]);

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
    const card = filteredCards[activeIndexRef.current];
    if (card) {
      onPick(card.scryfallId);
    }
  }, [filteredCards, onPick]);

  const directionArrow = passDirection === "left" ? "\u2190" : "\u2192";

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background overflow-hidden">
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
        {/* Inline filter pills */}
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 overflow-x-auto no-scrollbar">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onFilterChange(opt.value)}
              className={`
                flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0
                transition-colors
                ${filterMode === opt.value
                  ? "bg-accent text-white"
                  : "bg-surface text-foreground/70"
                }
              `}
            >
              {opt.colorVar && (
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: opt.colorVar }}
                />
              )}
              {opt.label}
            </button>
          ))}
        </div>

        {filteredCards.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-foreground/40 text-sm">No cards match this filter</p>
          </div>
        ) : (
          <>
            {/* Carousel */}
            <div className="flex-1 flex items-center min-h-0 relative">
              {/* Scroll container — cards are big by default, inactive ones shrink */}
              <div
                ref={scrollRef}
                className="flex overflow-x-auto w-full py-8 no-scrollbar items-center"
                style={{ paddingLeft: `${(100 - CARD_WIDTH_VW) / 2}vw`, paddingRight: `${(100 - CARD_WIDTH_VW) / 2}vw`, touchAction: "pan-x", scrollSnapType: "x mandatory", overscrollBehavior: "contain" }}
              >
                {filteredCards.map((card, i) => (
                  <div
                    key={card.scryfallId}
                    ref={(el) => { cardRefs.current[i] = el; }}
                    className="shrink-0"
                    style={{
                      width: `${CARD_WIDTH_VW}vw`,
                      maxWidth: "400px",
                      marginLeft: i === 0 ? 0 : `${CARD_OVERLAP_PX}px`,
                      scrollSnapAlign: "center",
                    }}
                  >
                    {/* Inner transform wrapper — GPU-composited via will-change,
                        separated from snap target (outer div) to avoid interference.
                        Initial transform ensures compositor layer exists from first paint. */}
                    <div className="will-change-transform" style={{ transform: "translate3d(0,0,0) scale3d(1,1,1)" }}>
                      <div
                        className={`relative card-aspect rounded-xl overflow-hidden border-2 shadow-lg ${getBorderClass(card.colors)}`}
                      >
                        <Image
                          src={card.imageUri}
                          alt={card.name}
                          fill
                          sizes="72vw"
                          className="object-cover"
                          priority={i < 3}
                        />
                        {card.isFoil && (
                          <span className="absolute top-1 right-1 text-sm drop-shadow-md">
                            ✦
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

            </div>

            {/* Scrub bar — positioned tight under carousel */}
            <div
              className="shrink-0 px-8 -mt-3 mb-1"
              onClick={(e) => {
                const el = scrollRef.current;
                if (!el) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                el.scrollTo({ left: progress * (el.scrollWidth - el.clientWidth), behavior: "smooth" });
              }}
            >
              <div className="w-full h-6 flex items-center cursor-pointer">
                <div className="w-full h-1.5 rounded-full bg-foreground/10 relative">
                  <div
                    ref={scrubThumbRef}
                    className="absolute top-0 h-full rounded-full bg-foreground/30 transition-[left] duration-75"
                    style={{ width: `${Math.max(8, 100 / Math.max(filteredCards.length, 1))}%`, left: "0%" }}
                  />
                </div>
              </div>
            </div>

            {/* Counter + Pick button */}
            <div className="shrink-0 px-4 pb-2 flex flex-col items-center gap-2">

              {/* Counter — updated via ref, no React re-render */}
              <div className="flex items-center gap-1">
                <span ref={counterRef} className="text-xs font-medium text-foreground/60">
                  1 / {filteredCards.length}
                </span>
              </div>

              {/* Card name — updated via ref, no React re-render */}
              <p ref={nameRef} className="text-sm font-semibold text-foreground text-center leading-tight truncate max-w-full">
                {filteredCards[0]?.name ?? ""}
              </p>

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
