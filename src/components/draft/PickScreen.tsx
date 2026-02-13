"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import type { CardReference, PickedCardSortMode, ManaColor, PackFilterValue } from "@/lib/types";
import CardThumbnail from "@/components/ui/CardThumbnail";
import Timer from "@/components/ui/Timer";
import PickedCardsDrawer from "./PickedCardsDrawer";
import Image from "next/image";

interface PickScreenProps {
  setCode: string | null;
  setName: string | null;
  startedAt: number | null;
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
  filterSet: Set<PackFilterValue>;
  onFilterToggle: (value: PackFilterValue | "all") => void;
  sortMode: PickedCardSortMode;
  onSortChange: (mode: PickedCardSortMode) => void;
  packQueueLength?: number;
}

const FILTER_OPTIONS: { value: PackFilterValue | "all"; manaClass?: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "W", manaClass: "ms ms-w ms-cost", label: "W" },
  { value: "U", manaClass: "ms ms-u ms-cost", label: "U" },
  { value: "B", manaClass: "ms ms-b ms-cost", label: "B" },
  { value: "R", manaClass: "ms ms-r ms-cost", label: "R" },
  { value: "G", manaClass: "ms ms-g ms-cost", label: "G" },
  { value: "multicolor", label: "Multi" },
  { value: "colorless", manaClass: "ms ms-c ms-cost", label: "C" },
];

function matchesFilterSet(card: CardReference, filterSet: Set<PackFilterValue>): boolean {
  if (filterSet.size === 0) return true;
  for (const f of filterSet) {
    if (f === "colorless" && card.colors.length === 0) return true;
    if (f === "multicolor" && card.colors.length >= 2) return true;
    if (card.colors.includes(f as ManaColor)) return true;
  }
  return false;
}

function getBorderClass(colors: string[]): string {
  if (colors.length === 0) return "card-border-C";
  if (colors.length > 1) return "card-border-M";
  return `card-border-${colors[0]}`;
}

export default function PickScreen({
  setCode,
  setName,
  startedAt,
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
  filterSet,
  onFilterToggle,
  sortMode,
  onSortChange,
  packQueueLength,
}: PickScreenProps) {
  const [selectedCard, setSelectedCard] = useState<CardReference | null>(null);
  const [showPickedDrawer, setShowPickedDrawer] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showGridView, setShowGridView] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const nameRef = useRef<HTMLParagraphElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const scrubThumbRef = useRef<HTMLDivElement>(null);
  const scrubBarRef = useRef<HTMLDivElement>(null);
  const snapToCardRef = useRef<(index: number) => void>(() => {});

  const filteredCards = packCards.filter((card) => matchesFilterSet(card, filterSet));
  const filterKey = [...filterSet].sort().join(",");

  // Card dimensions for carousel
  const CARD_WIDTH_VW = 72; // base card width
  const CARD_OVERLAP_PX = -35; // base negative margin for overlap
  const SCROLL_ACTIVE_SCALE = 1.15; // center card pops up large
  const SCROLL_INACTIVE_SCALE = 0.55; // distant cards shrink significantly
  const CARD_PULL_PX = 28; // max translateX pull toward center per distance unit

  // Pure transform carousel — no native scroll. All card movement driven by
  // JS touch handlers + rAF physics loop. Eliminates compositor/main-thread
  // timing mismatch that causes flicker on 120Hz displays.
  const activeIndexRef = useRef(0);

  useEffect(() => {
    const container = scrollRef.current;
    const wrapper = wrapperRef.current;
    if (!container || !wrapper || filteredCards.length === 0) return;

    // Trim stale refs from previous renders with more cards
    cardRefs.current.length = filteredCards.length;

    let running = true;
    let rafId = 0;

    // Layout cache
    const containerWidth = container.offsetWidth;
    const halfContainer = containerWidth / 2;
    const maxDist = containerWidth * 0.45;
    const scaleRange = SCROLL_ACTIVE_SCALE - SCROLL_INACTIVE_SCALE;

    const cardCenters: number[] = [];
    cardRefs.current.forEach((cardEl) => {
      if (!cardEl) { cardCenters.push(0); return; }
      cardCenters.push(cardEl.offsetLeft + cardEl.offsetWidth / 2);
    });

    const numCards = cardCenters.length;
    const minOffset = cardCenters[0] ?? 0;
    const maxOffset = cardCenters[numCards - 1] ?? 0;
    const offsetRange = maxOffset - minOffset;
    const canSwipe = numCards > 1;

    // Physics state
    let offset = cardCenters[0] ?? 0; // center on first card
    let velocity = 0; // px/ms
    let snapTarget: number | null = null;
    let isDragging = false;
    let lastTouchX = 0;
    let lastFrameTime = performance.now();
    const touchHistory: { x: number; t: number }[] = [];

    // Physics constants
    const FRICTION_PER_MS = 0.9975; // ~0.96 per 16ms frame
    const SNAP_VEL_THRESHOLD = 0.03; // px/ms — below this, snap to nearest
    const SNAP_SETTLE = 0.5; // px — snap animation done when this close
    const RUBBER_BAND = 0.3; // overscroll resistance during drag

    const clampOffset = (v: number) => Math.max(minOffset, Math.min(maxOffset, v));

    const rubberBand = (v: number): number => {
      if (v < minOffset) return minOffset + (v - minOffset) * RUBBER_BAND;
      if (v > maxOffset) return maxOffset + (v - maxOffset) * RUBBER_BAND;
      return v;
    };

    const findNearestCard = (pos: number): number => {
      let closest = cardCenters[0];
      let closestDist = Infinity;
      for (const center of cardCenters) {
        const d = Math.abs(pos - center);
        if (d < closestDist) { closestDist = d; closest = center; }
      }
      return closest;
    };

    const updateVisuals = () => {
      // Wrapper position — offset is the point in wrapper-space at screen center
      wrapper.style.transform = `translate3d(${halfContainer - offset}px, 0, 0)`;

      // Per-card transforms
      let closestIdx = 0;
      let closestDist = Infinity;

      for (let i = 0; i < cardRefs.current.length; i++) {
        const cardEl = cardRefs.current[i];
        if (!cardEl) continue;
        const dist = Math.abs(offset - cardCenters[i]);
        const t = Math.min(dist / maxDist, 1);
        const scale = Math.round((SCROLL_ACTIVE_SCALE - t * scaleRange) * 1000) / 1000;
        const pull = dist < 1 ? 0 : Math.round(Math.sign(offset - cardCenters[i]) * t * CARD_PULL_PX * 10) / 10;

        const inner = cardEl.firstElementChild as HTMLElement | null;
        if (inner) {
          inner.style.transform = `translate3d(${pull}px,0,0) scale3d(${scale},${scale},1)`;
        }

        if (dist < closestDist) { closestDist = dist; closestIdx = i; }
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

      // Scrub bar — position thumb by center, clamped to track bounds
      if (scrubThumbRef.current && offsetRange > 0) {
        const progress = (offset - minOffset) / offsetRange;
        const trackWidth = scrubBarRef.current?.querySelector('[data-scrub-track]')?.clientWidth ?? 0;
        const thumbWidth = scrubThumbRef.current.offsetWidth;
        const maxLeft = trackWidth - thumbWidth;
        const leftPx = Math.round(progress * maxLeft);
        scrubThumbRef.current.style.transform = `translateX(${leftPx}px)`;
      }
    };

    // Expose snap-to-card for scrub bar
    snapToCardRef.current = (idx: number) => {
      velocity = 0;
      snapTarget = cardCenters[Math.max(0, Math.min(idx, cardCenters.length - 1))];
    };

    // --- Touch handlers ---
    const onTouchStart = (e: TouchEvent) => {
      isDragging = true;
      velocity = 0;
      snapTarget = null;
      lastTouchX = e.touches[0].clientX;
      touchHistory.length = 0;
      touchHistory.push({ x: lastTouchX, t: performance.now() });
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault(); // we own all touch behavior
      const x = e.touches[0].clientX;
      const dx = x - lastTouchX;
      lastTouchX = x;
      offset = rubberBand(offset - dx); // drag right → offset decreases → earlier cards

      const now = performance.now();
      touchHistory.push({ x, t: now });
      if (touchHistory.length > 5) touchHistory.shift();
    };

    const onTouchEnd = () => {
      isDragging = false;

      // Snap back from rubber band overscroll
      if (offset < minOffset || offset > maxOffset) {
        velocity = 0;
        snapTarget = offset < minOffset ? minOffset : maxOffset;
        return;
      }

      // Compute velocity from touch history
      if (touchHistory.length >= 2) {
        const last = touchHistory[touchHistory.length - 1];
        let ref = touchHistory[0];
        const now = performance.now();
        for (let i = touchHistory.length - 2; i >= 0; i--) {
          if (now - touchHistory[i].t > 50) { ref = touchHistory[i]; break; }
        }
        const dt = last.t - ref.t;
        if (dt > 0) velocity = -(last.x - ref.x) / dt; // px/ms
      }

      // If velocity too low, snap immediately
      if (Math.abs(velocity) < SNAP_VEL_THRESHOLD) {
        velocity = 0;
        snapTarget = findNearestCard(offset);
      }
    };

    // --- rAF loop ---
    const tick = () => {
      if (!running) return;
      const now = performance.now();
      const dt = Math.min(now - lastFrameTime, 32); // cap at ~30fps min
      lastFrameTime = now;

      if (!isDragging) {
        if (snapTarget !== null) {
          // Snap animation — frame-rate independent lerp
          const diff = snapTarget - offset;
          offset += diff * (1 - Math.pow(0.85, dt / 16.67));
          if (Math.abs(diff) < SNAP_SETTLE) {
            offset = snapTarget;
            snapTarget = null;
          }
        } else if (Math.abs(velocity) > 0.001) {
          // Momentum — frame-rate independent friction
          offset += velocity * dt;
          velocity *= Math.pow(FRICTION_PER_MS, dt);
          offset = clampOffset(offset);

          if (Math.abs(velocity) < SNAP_VEL_THRESHOLD) {
            velocity = 0;
            snapTarget = findNearestCard(offset);
          }
        }
      }

      updateVisuals();
      rafId = requestAnimationFrame(tick);
    };

    // Initial state
    updateVisuals();
    for (let i = 0; i < cardRefs.current.length; i++) {
      const cardEl = cardRefs.current[i];
      if (cardEl) cardEl.style.zIndex = `${100 - Math.abs(i) * 10}`;
    }

    // Start loop + listeners (only attach touch if more than 1 card)
    rafId = requestAnimationFrame(tick);
    if (canSwipe) {
      container.addEventListener("touchstart", onTouchStart, { passive: true });
      container.addEventListener("touchmove", onTouchMove, { passive: false });
      container.addEventListener("touchend", onTouchEnd, { passive: true });
    }

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      if (canSwipe) {
        container.removeEventListener("touchstart", onTouchStart);
        container.removeEventListener("touchmove", onTouchMove);
        container.removeEventListener("touchend", onTouchEnd);
      }
    };
  }, [filteredCards.length, filterKey]);

  // Reset active index when filter changes
  useEffect(() => {
    activeIndexRef.current = 0;
  }, [filterKey]);

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

  const isFilterActive = (value: PackFilterValue | "all") =>
    value === "all" ? filterSet.size === 0 : filterSet.has(value);

  const desktopFilterLabel = filterSet.size === 0
    ? "Filter"
    : `Filter (${filterSet.size})`;

  const draftDateStr = startedAt
    ? new Date(startedAt).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })
    : null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background overflow-hidden">
      {/* ===== MOBILE HEADER (two rows) ===== */}
      <header className="flex flex-col shrink-0 sm:hidden">
        {/* Row 1: podman left, set symbol + name centered, date right */}
        <div className="flex items-center px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm">
          <Link href="/" className="text-lg font-bold tracking-tight text-foreground shrink-0 w-16">
            podman
          </Link>
          <div className="flex-1 flex items-center justify-center gap-1.5 min-w-0">
            {setCode && (
              <i className={`ss ss-${setCode.toLowerCase()} text-foreground`} style={{ fontSize: "16px" }} />
            )}
            {setName && (
              <span className="text-sm font-bold text-foreground truncate">{setName}</span>
            )}
          </div>
          {draftDateStr ? (
            <span className="text-xs text-foreground/40 shrink-0 w-16 text-right">{draftDateStr}</span>
          ) : (
            <div className="w-16 shrink-0" />
          )}
        </div>
        {/* Row 2: timer | Pack N: Pick N | picks button */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <Timer
            seconds={timerSeconds}
            maxSeconds={timerMaxSeconds}
            paused={timerPaused}
          />
          <div className="flex flex-col items-center">
            <span className="text-base text-foreground">
              <span className="font-bold">Pack {packNumber}:</span>{" "}
              <span className="font-medium">Pick {pickInPack}</span>
            </span>
            <span className="text-xs text-foreground/40">
              {packCards.length}/{totalCardsInPack} cards
              {!!packQueueLength && packQueueLength > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-accent text-white text-[10px] font-medium">
                  +{packQueueLength}
                </span>
              )}
              <span className="ml-1.5">{directionArrow} {passDirection}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowPickedDrawer(true)}
            className="px-2.5 py-1.5 rounded-lg bg-surface text-xs font-medium text-foreground hover:bg-surface-hover transition-colors border border-border"
          >
            Picks ({picks.length})
          </button>
        </div>
      </header>

      {/* ===== DESKTOP HEADER (single row, unchanged layout) ===== */}
      <header className="hidden sm:flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
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
        {/* Inline filter pills — mana symbols, multi-select, no wrap */}
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 flex-nowrap overflow-x-auto no-scrollbar">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onFilterToggle(opt.value)}
              className={`
                flex items-center justify-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0
                transition-colors
                ${isFilterActive(opt.value)
                  ? "bg-accent text-white"
                  : "bg-surface text-foreground/70"
                }
              `}
            >
              {opt.manaClass ? (
                <i className={opt.manaClass} style={{ fontSize: "14px" }} />
              ) : opt.value === "multicolor" ? (
                <span
                  className="w-3.5 h-3.5 rounded-full inline-block"
                  style={{ backgroundColor: "var(--mana-gold)" }}
                />
              ) : null}
              {opt.value === "all" ? "All" : null}
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
              {/* Transform container — no native scroll, all movement via JS transforms */}
              <div
                ref={scrollRef}
                className="w-full overflow-hidden"
                style={{ touchAction: "none" }}
              >
                <div
                  ref={wrapperRef}
                  className="flex items-center py-8 will-change-transform"
                  style={{ transform: "translate3d(0,0,0)" }}
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
                      }}
                    >
                      {/* Inner transform wrapper — GPU-composited, initial transform
                          ensures compositor layer exists from first paint */}
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

            </div>

            {/* Scrub bar — thicker, tight under carousel. Hidden for single card. */}
            <div
              ref={scrubBarRef}
              className={`shrink-0 px-6 -mt-8 ${filteredCards.length <= 1 ? "invisible" : ""}`}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const targetIdx = Math.round(progress * (filteredCards.length - 1));
                snapToCardRef.current(targetIdx);
              }}
              onTouchStart={(e) => {
                e.stopPropagation(); // don't trigger carousel drag
                const rect = e.currentTarget.getBoundingClientRect();
                const progress = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width));
                snapToCardRef.current(Math.round(progress * (filteredCards.length - 1)));
              }}
              onTouchMove={(e) => {
                e.stopPropagation();
                e.preventDefault();
                const bar = scrubBarRef.current;
                if (!bar) return;
                const rect = bar.getBoundingClientRect();
                const progress = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width));
                snapToCardRef.current(Math.round(progress * (filteredCards.length - 1)));
              }}
            >
              <div className="w-full h-12 flex items-center cursor-pointer">
                <div data-scrub-track className="w-full h-3.5 rounded-full bg-foreground/10 relative">
                  <div
                    ref={scrubThumbRef}
                    className="absolute top-0 h-full rounded-full bg-foreground/40 will-change-transform"
                    style={{ width: "32px", transform: "translateX(0px)" }}
                  />
                </div>
              </div>
            </div>

            {/* Counter + Pick button */}
            <div className="shrink-0 px-4 pb-2 flex flex-col items-center gap-2">

              {/* Counter + grid view button */}
              <div className="flex items-center gap-2">
                <span ref={counterRef} className="text-xs font-medium text-foreground/60">
                  1 / {filteredCards.length}
                </span>
                <button
                  type="button"
                  onClick={() => setShowGridView(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface text-foreground/60 hover:text-foreground/80 transition-colors border border-border"
                  aria-label="View all cards"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="0" y="0" width="4.5" height="4.5" rx="1" />
                    <rect x="5.75" y="0" width="4.5" height="4.5" rx="1" />
                    <rect x="11.5" y="0" width="4.5" height="4.5" rx="1" />
                    <rect x="0" y="5.75" width="4.5" height="4.5" rx="1" />
                    <rect x="5.75" y="5.75" width="4.5" height="4.5" rx="1" />
                    <rect x="11.5" y="5.75" width="4.5" height="4.5" rx="1" />
                    <rect x="0" y="11.5" width="4.5" height="4.5" rx="1" />
                    <rect x="5.75" y="11.5" width="4.5" height="4.5" rx="1" />
                    <rect x="11.5" y="11.5" width="4.5" height="4.5" rx="1" />
                  </svg>
                  <span className="text-xs font-medium">Grid</span>
                </button>
              </div>

              {/* Card name — updated via ref, no React re-render */}
              <p ref={nameRef} className="text-base font-semibold text-foreground text-center leading-tight truncate max-w-full">
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
                ${filterSet.size > 0
                  ? "bg-accent text-white"
                  : "bg-background text-foreground hover:bg-surface-hover"
                }
              `}
            >
              {desktopFilterLabel}
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
                          onFilterToggle(opt.value);
                          if (opt.value === "all") setShowFilterMenu(false);
                        }}
                        className={`
                          flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-xs font-semibold
                          transition-colors
                          ${isFilterActive(opt.value)
                            ? "bg-accent text-white"
                            : "bg-background text-foreground/70 hover:bg-surface-hover"
                          }
                        `}
                      >
                        {opt.manaClass ? (
                          <i className={opt.manaClass} style={{ fontSize: "14px" }} />
                        ) : opt.value === "multicolor" ? (
                          <span
                            className="w-3 h-3 rounded-full inline-block shrink-0"
                            style={{ backgroundColor: "var(--mana-gold)" }}
                          />
                        ) : null}
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

      {/* Grid view overlay (mobile) */}
      {showGridView && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background sm:hidden">
          <header className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
            <span className="text-sm font-semibold text-foreground">
              All Cards ({filteredCards.length})
            </span>
            <button
              type="button"
              onClick={() => setShowGridView(false)}
              className="px-2.5 py-1.5 rounded-lg bg-surface text-xs font-medium text-foreground hover:bg-surface-hover transition-colors border border-border"
            >
              Close
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-2">
            <div className="grid grid-cols-3 gap-1.5">
              {filteredCards.map((card, i) => (
                <button
                  key={card.scryfallId}
                  type="button"
                  onClick={() => {
                    setShowGridView(false);
                    snapToCardRef.current(i);
                  }}
                  className="relative"
                >
                  <div className={`relative card-aspect rounded-lg overflow-hidden border-2 ${getBorderClass(card.colors)}`}>
                    <Image
                      src={card.smallImageUri || card.imageUri}
                      alt={card.name}
                      fill
                      sizes="33vw"
                      className="object-cover"
                    />
                    {card.isFoil && (
                      <span className="absolute top-0.5 right-0.5 text-xs drop-shadow-md">
                        ✦
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
