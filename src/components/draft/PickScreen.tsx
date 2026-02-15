"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import type { CardReference, ManaColor, PackFilterValue, PodMemberStatus, BasicLandCounts } from "@/lib/types";
import CardThumbnail from "@/components/ui/CardThumbnail";
import Timer from "@/components/ui/Timer";
import DeckBuilderScreen from "@/components/deck-builder/DeckBuilderScreen";
import PodStatusOverlay from "./PodStatusOverlay";
import { useCarousel } from "@/hooks/useCarousel";
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
  packQueueLength?: number;
  podMembers: PodMemberStatus[];
  onDeckChange?: (deck: CardReference[], sideboard: CardReference[], lands: BasicLandCounts) => void;
  initialDeck?: CardReference[] | null;
  initialSideboard?: CardReference[] | null;
  crackAPack?: boolean;
  crackAPackLabel?: string;
  onCrackAnother?: () => void;
  onBackToSetPicker?: () => void;
  crackAPackLoading?: boolean;
}

// Row 1: color filters
const COLOR_FILTERS: { value: PackFilterValue | "all"; manaClass?: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "W", manaClass: "ms ms-w ms-cost", label: "W" },
  { value: "U", manaClass: "ms ms-u ms-cost", label: "U" },
  { value: "B", manaClass: "ms ms-b ms-cost", label: "B" },
  { value: "R", manaClass: "ms ms-r ms-cost", label: "R" },
  { value: "G", manaClass: "ms ms-g ms-cost", label: "G" },
  { value: "multicolor", label: "Multi" },
  { value: "colorless", manaClass: "ms ms-c ms-cost", label: "C" },
];

// Row 2: type filters
const TYPE_FILTERS: { value: PackFilterValue; label: string }[] = [
  { value: "creature", label: "Creatures" },
  { value: "noncreature", label: "Non-Creatures" },
];

function isCreature(card: CardReference): boolean {
  if (!card.typeLine) return false;
  return card.typeLine.includes("Creature");
}

function matchesFilterSet(card: CardReference, filterSet: Set<PackFilterValue>): boolean {
  if (filterSet.size === 0) return true;

  // Split filters into color filters and type filters
  const colorFilters: PackFilterValue[] = [];
  let wantCreature = false;
  let wantNoncreature = false;

  for (const f of filterSet) {
    if (f === "creature") wantCreature = true;
    else if (f === "noncreature") wantNoncreature = true;
    else colorFilters.push(f);
  }

  // Color match (OR across color filters, pass if no color filters)
  let colorMatch = colorFilters.length === 0;
  if (!colorMatch) {
    for (const f of colorFilters) {
      if (f === "colorless" && card.colors.length === 0) { colorMatch = true; break; }
      if (f === "multicolor" && card.colors.length >= 2) { colorMatch = true; break; }
      if (card.colors.includes(f as ManaColor)) { colorMatch = true; break; }
    }
  }

  // Type match (OR across type filters, pass if no type filters)
  let typeMatch = !wantCreature && !wantNoncreature;
  if (!typeMatch) {
    const creature = isCreature(card);
    if (wantCreature && creature) typeMatch = true;
    if (wantNoncreature && !creature) typeMatch = true;
  }

  // Both must match (AND between color and type groups)
  return colorMatch && typeMatch;
}

function getBorderClass(colors: string[]): string {
  if (colors.length === 0) return "card-border-C";
  if (colors.length > 1) return "card-border-M";
  return `card-border-${colors[0]}`;
}

/** Get front or back face name from a DFC's "Front // Back" name */
function getCardFaceName(card: CardReference, showBack: boolean): string {
  if (!showBack) return card.name;
  const parts = card.name.split(" // ");
  return parts.length > 1 ? parts[1] : card.name;
}

const LONG_PRESS_MS = 500;

function LongPressPickButton({ onPick }: { onPick: () => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const [pressing, setPressing] = useState(false);

  const cancel = useCallback(() => {
    setPressing(false);
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (fillRef.current) {
      fillRef.current.style.transition = "width 150ms ease-out";
      fillRef.current.style.width = "0%";
    }
  }, []);

  const start = useCallback(() => {
    setPressing(true);
    if (fillRef.current) {
      fillRef.current.style.transition = `width ${LONG_PRESS_MS}ms linear`;
      fillRef.current.style.width = "100%";
    }
    timerRef.current = setTimeout(() => {
      onPick();
      cancel();
    }, LONG_PRESS_MS);
  }, [onPick, cancel]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <button
      type="button"
      onTouchStart={start}
      onTouchEnd={cancel}
      onTouchCancel={cancel}
      onMouseDown={start}
      onMouseUp={cancel}
      onMouseLeave={cancel}
      className={`
        relative w-full max-w-[320px] py-3 rounded-xl overflow-hidden
        bg-accent/30 text-white font-bold text-base tracking-wide
        select-none
        ${pressing ? "scale-[0.97]" : ""}
        transition-transform duration-100
      `}
    >
      <div
        ref={fillRef}
        className="absolute inset-0 bg-accent rounded-xl"
        style={{ width: "0%", transition: "width 150ms ease-out" }}
      />
      <span className="relative z-10">HOLD TO PICK</span>
    </button>
  );
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
  packQueueLength,
  podMembers,
  onDeckChange,
  initialDeck,
  initialSideboard,
  crackAPack,
  crackAPackLabel,
  onCrackAnother,
  onBackToSetPicker,
  crackAPackLoading,
}: PickScreenProps) {
  const [selectedCard, setSelectedCard] = useState<CardReference | null>(null);
  const [showDeckBuilder, setShowDeckBuilder] = useState(false);
  const [showGridView, setShowGridView] = useState(false);
  const [showPodStatus, setShowPodStatus] = useState(false);
  // Track which cards are showing back face (by scryfallId)
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());
  const flippedCardsRef = useRef<Set<string>>(flippedCards);
  useEffect(() => { flippedCardsRef.current = flippedCards; }, [flippedCards]);
  const filteredCards = packCards.filter((card) => matchesFilterSet(card, filterSet));
  const filterKey = [...filterSet].sort().join(",");

  // Card dimensions for carousel (JSX only — physics constants live in useCarousel)
  const CARD_WIDTH_VW = 72; // base card width
  const CARD_OVERLAP_PX = -35; // base negative margin for overlap

  const { scrollRef, wrapperRef, cardRefs, nameRef, counterRef, scrubThumbRef, scrubBarRef, activeIndexRef, snapToCardRef } = useCarousel({ filteredCards, filterKey, flippedCardsRef });

  const toggleFlip = useCallback((scryfallId: string) => {
    setFlippedCards((prev) => {
      const next = new Set(prev);
      if (next.has(scryfallId)) next.delete(scryfallId);
      else next.add(scryfallId);
      return next;
    });
  }, []);

  const handleCardClick = useCallback((card: CardReference) => {
    setSelectedCard(card);
    // Reset flip when selecting a different card
    setFlippedCards(new Set());
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

  const draftDateStr = startedAt
    ? new Date(startedAt).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })
    : null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background overflow-hidden">
      {/* ===== MOBILE HEADER (two rows) ===== */}
      <header className="flex flex-col shrink-0 sm:hidden">
        {/* Row 1: podman left, set symbol + name centered, date right */}
        <div className="flex items-center px-4 h-12 border-b border-border bg-background/95 backdrop-blur-sm">
          <Link href="/dashboard" className="text-xl font-bold tracking-tight text-foreground shrink-0 w-16">
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
          {crackAPackLabel ? (
            <span className="text-xs text-foreground/40 shrink-0 text-right">{crackAPackLabel}</span>
          ) : draftDateStr ? (
            <span className="text-xs text-foreground/40 shrink-0 w-16 text-right">{draftDateStr}</span>
          ) : (
            <div className="w-16 shrink-0" />
          )}
        </div>
        {/* Row 2: timer | Pack N: Pick N | picks button */}
        {!crackAPack && (
          <div className="flex items-center justify-between px-4 pt-1 pb-1.5 border-b border-border">
            <Timer
              seconds={timerSeconds}
              maxSeconds={timerMaxSeconds}
              paused={timerPaused}
            />
            <button
              type="button"
              onClick={() => setShowPodStatus(true)}
              className="flex flex-col items-center"
            >
              <span className="text-base text-foreground">
                <span className="font-bold">Pack {packNumber}:</span>{" "}
                <span className="font-medium">Pick {pickInPack}</span>
                <PodIcon className="inline-block ml-1 w-3.5 h-3.5 text-foreground/40 align-[-2px]" />
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
            </button>
            <button
              type="button"
              onClick={() => setShowDeckBuilder(true)}
              className="px-2.5 py-1.5 rounded-lg bg-surface text-xs font-medium text-foreground hover:bg-surface-hover transition-colors border border-border"
            >
              My Deck
            </button>
          </div>
        )}
      </header>

      {/* ===== DESKTOP HEADER (two rows) ===== */}
      <div className="hidden sm:flex flex-col shrink-0">
        {/* Row 1: info bar — podman, set name, timer */}
        <div className="border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="max-w-5xl mx-auto w-full flex items-center px-4 h-12">
            <Link href="/dashboard" className="text-xl font-bold tracking-tight text-foreground shrink-0">
              podman
            </Link>
            <div className="flex-1 flex items-center justify-center gap-1.5 min-w-0">
              {setCode && (
                <i className={`ss ss-${setCode.toLowerCase()} text-foreground`} style={{ fontSize: "16px" }} />
              )}
              {setName && (
                <span className="text-sm font-bold text-foreground">{setName}</span>
              )}
              {draftDateStr && (
                <span className="text-xs text-foreground/40 ml-1">{draftDateStr}</span>
              )}
            </div>
            {crackAPackLabel ? (
              <span className="shrink-0 text-xs text-foreground/40">{crackAPackLabel}</span>
            ) : !crackAPack ? (
              <div className="shrink-0 flex justify-end">
                <Timer
                  seconds={timerSeconds}
                  maxSeconds={timerMaxSeconds}
                  paused={timerPaused}
                />
              </div>
            ) : null}
          </div>
        </div>
        {/* Row 2: controls — pack info, filters, picks */}
        {!crackAPack && (
          <div className="border-b border-border">
            <div className="max-w-5xl mx-auto w-full flex items-center justify-between px-4 py-1.5">
              <button
                type="button"
                onClick={() => setShowPodStatus(true)}
                className="flex flex-col text-left hover:bg-surface rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors"
              >
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
                  <PodIcon className="inline-block ml-1.5 w-3.5 h-3.5 text-foreground/40 align-[-2px]" />
                </span>
                <span className="text-xs text-foreground/50">
                  {directionArrow} Pass {passDirection}
                </span>
              </button>

              {/* Inline filters */}
              <div className="flex items-center gap-1">
                {COLOR_FILTERS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onFilterToggle(opt.value)}
                    className={`
                      flex items-center justify-center gap-1 px-2 py-1 rounded-full text-xs font-semibold
                      transition-colors
                      ${isFilterActive(opt.value)
                        ? "bg-accent text-white"
                        : "bg-surface text-foreground/70 hover:bg-surface-hover"
                      }
                    `}
                  >
                    {opt.manaClass ? (
                      <i className={opt.manaClass} style={{ fontSize: "13px" }} />
                    ) : opt.value === "multicolor" ? (
                      <span
                        className="w-3 h-3 rounded-full inline-block"
                        style={{ backgroundColor: "var(--mana-gold)" }}
                      />
                    ) : null}
                    {opt.value === "all" ? "All" : null}
                  </button>
                ))}
                <span className="w-px h-4 bg-border mx-1" />
                {TYPE_FILTERS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onFilterToggle(opt.value)}
                    className={`
                      px-2 py-1 rounded-full text-xs font-semibold
                      transition-colors
                      ${isFilterActive(opt.value)
                        ? "bg-accent text-white"
                        : "bg-surface text-foreground/70 hover:bg-surface-hover"
                      }
                    `}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowDeckBuilder(true)}
                className="px-2.5 py-1.5 rounded-lg bg-surface text-xs font-medium text-foreground hover:bg-surface-hover transition-colors border border-border"
              >
                My Deck
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ==================== MOBILE: Carousel ==================== */}
      <div className="flex-1 flex flex-col min-h-0 sm:hidden">
        {/* Filter pills — two centered rows */}
        {!crackAPack && (
          <div className="shrink-0 flex flex-col items-center gap-1 px-3 py-1">
            {/* Row 1: color filters */}
            <div className="flex items-center justify-center gap-1.5 flex-nowrap">
              {COLOR_FILTERS.map((opt) => (
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
            {/* Row 2: type filters */}
            <div className="flex items-center justify-center gap-1.5">
              {TYPE_FILTERS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onFilterToggle(opt.value)}
                  className={`
                    px-2.5 py-1 rounded-full text-xs font-semibold shrink-0
                    transition-colors
                    ${isFilterActive(opt.value)
                      ? "bg-accent text-white"
                      : "bg-surface text-foreground/70"
                    }
                  `}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {filteredCards.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-foreground/40 text-sm">No cards match this filter</p>
          </div>
        ) : (
          <>
            {/* Carousel */}
            <div className="flex-1 flex items-center min-h-0 relative overflow-hidden" style={{ marginTop: "-10px", containerType: "size" }}>
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
                        width: `min(${CARD_WIDTH_VW}vw, 400px, calc((100cqh - 80px) * 488 / 680))`,
                        marginLeft: i === 0 ? 0 : `${CARD_OVERLAP_PX}px`,
                      }}
                    >
                      {/* Inner transform wrapper — GPU-composited, initial transform
                          ensures compositor layer exists from first paint */}
                      <div className="will-change-transform" style={{ transform: "translate3d(0,0,0) scale3d(1,1,1)" }}>
                        <div
                          className={`relative card-aspect rounded-xl overflow-hidden border-2 shadow-lg ${crackAPack ? "border-border" : getBorderClass(card.colors)}`}
                        >
                          <Image
                            src={flippedCards.has(card.scryfallId) && card.backImageUri ? card.backImageUri : card.imageUri}
                            alt={getCardFaceName(card, flippedCards.has(card.scryfallId))}
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
                          {card.backImageUri && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleFlip(card.scryfallId); }}
                              className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-black/50 text-white/90 flex items-center justify-center text-base drop-shadow-md active:scale-90 transition-transform"
                              aria-label="Flip card"
                            >
                              ↻
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Scrub row: counter | scrub bar | grid button */}
            <div className={`shrink-0 flex items-start justify-center gap-3 px-4 -mt-4 ${filteredCards.length <= 1 ? "invisible" : ""}`}>
              <span ref={counterRef} className="text-xs font-medium text-foreground/60 shrink-0" style={{ marginTop: "12px", marginRight: "4px" }}>
                1 / {filteredCards.length}
              </span>
              <div
                ref={scrubBarRef}
                className="shrink-0"
                style={{ width: "50%" }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  const targetIdx = Math.round(progress * (filteredCards.length - 1));
                  snapToCardRef.current(targetIdx);
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
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
                <div className="w-full h-10 flex items-center cursor-pointer">
                  <div data-scrub-track className="w-full h-3 rounded-full bg-foreground/10 relative">
                    <div
                      ref={scrubThumbRef}
                      className="absolute top-0 h-full rounded-full bg-foreground/40 will-change-transform"
                      style={{ width: "32px", transform: "translateX(0px)" }}
                    />
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGridView(true)}
                className="flex items-center justify-center shrink-0 w-10 h-10 rounded-lg bg-surface text-foreground/60 hover:text-foreground/80 transition-colors border border-border"
                style={{ marginTop: "14px", marginLeft: "4px" }}
                aria-label="View all cards"
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
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
              </button>
            </div>

            {/* Card name + Pick button */}
            <div className="shrink-0 px-4 pt-2 flex flex-col items-center gap-2" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6px)" }}>
              <p ref={nameRef} className="text-base font-semibold text-foreground text-center leading-tight truncate max-w-full">
                {filteredCards[0] ? getCardFaceName(filteredCards[0], flippedCards.has(filteredCards[0].scryfallId)) : ""}
              </p>

              {crackAPack ? (
                <div className="flex items-center gap-2 w-full max-w-[320px]">
                  <button
                    type="button"
                    onClick={onBackToSetPicker}
                    className="flex-1 py-3 rounded-xl bg-surface text-foreground font-bold text-sm tracking-wide border border-border"
                  >
                    Change Set
                  </button>
                  <button
                    type="button"
                    onClick={onCrackAnother}
                    disabled={crackAPackLoading}
                    className="flex-1 py-3 rounded-xl bg-accent text-white font-bold text-sm tracking-wide hover:bg-accent-hover transition-colors disabled:opacity-40"
                  >
                    {crackAPackLoading ? "Opening..." : "Crack Another"}
                  </button>
                </div>
              ) : (
                /* Pick button — long-press to confirm */
                <LongPressPickButton onPick={handleCarouselPick} />
              )}
            </div>
          </>
        )}

      </div>

      {/* ==================== DESKTOP: Grid ==================== */}
      <div className="hidden sm:flex flex-1 flex-col min-h-0">
        {/* Card grid — scrollable area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="max-w-5xl mx-auto grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-2 p-3">
            {filteredCards.map((card) => (
              <CardThumbnail
                key={card.scryfallId}
                card={card}
                selected={selectedCard?.scryfallId === card.scryfallId}
                onClick={() => handleCardClick(card)}
                onDoubleClick={crackAPack ? undefined : () => handleQuickPick(card)}
                hideColorBorder={crackAPack}
              />
            ))}
          </div>

          {filteredCards.length === 0 && (
            <p className="text-center text-foreground/40 text-sm py-8">
              No cards match this filter
            </p>
          )}
        </div>

      </div>

      {/* ==================== DESKTOP: Card Preview Modal ==================== */}
      {selectedCard && (
        <div
          className="hidden sm:flex fixed inset-0 z-50 items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => { setSelectedCard(null); setFlippedCards(new Set()); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setSelectedCard(null); setFlippedCards(new Set()); }
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`Preview of ${getCardFaceName(selectedCard, flippedCards.has(selectedCard.scryfallId))}`}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={() => {}}
            role="presentation"
            className="flex flex-col items-center gap-4 px-4"
          >
            {/* Close hint */}
            <button
              type="button"
              onClick={() => { setSelectedCard(null); setFlippedCards(new Set()); }}
              className="w-10 h-1 rounded-full bg-foreground/30 shrink-0 cursor-pointer"
              aria-label="Close preview"
            />

            {/* Large card image */}
            <div className="relative w-[85vw] max-w-[400px] card-aspect rounded-xl overflow-hidden">
              <Image
                src={flippedCards.has(selectedCard.scryfallId) && selectedCard.backImageUri ? selectedCard.backImageUri : selectedCard.imageUri}
                alt={getCardFaceName(selectedCard, flippedCards.has(selectedCard.scryfallId))}
                fill
                sizes="(max-width: 768px) 85vw, 400px"
                className="object-cover"
                priority
              />
            </div>

            {/* Card name */}
            <h3 className="text-base font-semibold text-white text-center">
              {getCardFaceName(selectedCard, flippedCards.has(selectedCard.scryfallId))}
            </h3>

            {/* Action buttons */}
            <div className="w-full max-w-[400px] flex flex-col gap-2">
              {selectedCard.backImageUri && (
                <button
                  type="button"
                  onClick={() => toggleFlip(selectedCard.scryfallId)}
                  className="w-full py-3 rounded-xl bg-surface border border-border text-foreground font-medium text-sm active:scale-[0.97] transition-all hover:bg-surface-hover"
                >
                  {flippedCards.has(selectedCard.scryfallId) ? "Show Front" : "Show Back"}
                </button>
              )}
              {crackAPack ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onBackToSetPicker}
                    className="flex-1 py-3 rounded-xl bg-surface border border-border text-foreground font-bold text-sm tracking-wide hover:bg-surface-hover transition-colors"
                  >
                    Change Set
                  </button>
                  <button
                    type="button"
                    onClick={onCrackAnother}
                    disabled={crackAPackLoading}
                    className="flex-1 py-3 rounded-xl bg-accent text-white font-bold text-sm tracking-wide hover:bg-accent-hover transition-colors disabled:opacity-40"
                  >
                    {crackAPackLoading ? "Opening..." : "Crack Another"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handlePick}
                  className="w-full py-3 rounded-xl bg-accent text-white font-bold text-sm tracking-wide hover:bg-accent-hover active:scale-[0.97] transition-all duration-100"
                >
                  PICK
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
                  <div className={`relative card-aspect rounded-lg overflow-hidden border-2 ${crackAPack ? "border-border" : getBorderClass(card.colors)}`}>
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
                    {card.backImageUri && (
                      <span className="absolute bottom-0.5 right-0.5 text-xs leading-none drop-shadow-md text-white/80">
                        ↻
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Deck builder overlay */}
      {!crackAPack && showDeckBuilder && (
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

      {/* Pod status overlay */}
      {!crackAPack && (
        <PodStatusOverlay
          members={podMembers}
          passDirection={passDirection}
          isOpen={showPodStatus}
          onClose={() => setShowPodStatus(false)}
        />
      )}
    </div>
  );
}

function PodIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
    >
      <path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.636.818.818 0 0 1-.36.98A7.465 7.465 0 0 1 14.5 16Z" />
    </svg>
  );
}
