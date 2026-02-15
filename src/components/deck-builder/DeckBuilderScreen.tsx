"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import Image from "next/image";
import type { CardReference, BasicLandCounts, ManaColor } from "@/lib/types";
import { MANA_COLORS } from "@/lib/types";
import CardThumbnail from "@/components/ui/CardThumbnail";
import ManaCurve from "@/components/ui/ManaCurve";

// --- Types ---

type SortMode = "cmc" | "color" | "rarity";

interface DeckBuilderScreenProps {
  pool: CardReference[];
  initialDeck?: CardReference[];
  initialSideboard?: CardReference[];
  initialLands?: BasicLandCounts;
  initialDeckName?: string;
  mode?: "full" | "midDraft";
  onSubmitDeck?: (
    deck: CardReference[],
    sideboard: CardReference[],
    lands: BasicLandCounts,
    deckName?: string
  ) => void;
  onSkip?: () => void;
  onDeckChange?: (
    deck: CardReference[],
    sideboard: CardReference[],
    lands: BasicLandCounts,
    deckName?: string
  ) => void;
  onClose?: () => void;
}

// --- Helpers ---

const EMPTY_LANDS: BasicLandCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };

const LAND_NAMES: Record<ManaColor, string> = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
};

const MANA_ICON_CLASS: Record<ManaColor, string> = {
  W: "ms ms-w ms-cost",
  U: "ms ms-u ms-cost",
  B: "ms ms-b ms-cost",
  R: "ms ms-r ms-cost",
  G: "ms ms-g ms-cost",
};

const RARITY_ORDER: Record<string, number> = {
  mythic: 0,
  rare: 1,
  uncommon: 2,
  common: 3,
};

const COLOR_ORDER: Record<string, number> = {
  W: 0,
  U: 1,
  B: 2,
  R: 3,
  G: 4,
};

function colorSortKey(colors: ManaColor[]): number {
  if (colors.length === 0) return 6; // colorless last
  if (colors.length > 1) return 5; // multicolor before colorless
  return COLOR_ORDER[colors[0]] ?? 5;
}

function sortCards(cards: CardReference[], mode: SortMode): CardReference[] {
  const sorted = [...cards];
  sorted.sort((a, b) => {
    switch (mode) {
      case "cmc":
        return a.cmc - b.cmc || a.name.localeCompare(b.name);
      case "color":
        return (
          colorSortKey(a.colors) - colorSortKey(b.colors) ||
          a.cmc - b.cmc ||
          a.name.localeCompare(b.name)
        );
      case "rarity":
        return (
          (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9) ||
          a.cmc - b.cmc ||
          a.name.localeCompare(b.name)
        );
    }
  });
  return sorted;
}

function totalLandCount(lands: BasicLandCounts): number {
  return MANA_COLORS.reduce((sum, c) => sum + lands[c], 0);
}

function isCreature(card: CardReference): boolean {
  return card.typeLine?.toLowerCase().includes("creature") ?? false;
}

// --- Main Component ---

export default function DeckBuilderScreen({
  pool,
  initialDeck,
  initialSideboard,
  initialLands,
  initialDeckName,
  mode = "full",
  onSubmitDeck,
  onSkip,
  onDeckChange,
  onClose,
}: DeckBuilderScreenProps) {
  const isMidDraft = mode === "midDraft";
  const [deck, setDeck] = useState<CardReference[]>(() => {
    if (isMidDraft) {
      const base = initialDeck ?? [];
      const baseIds = new Set(base.map((c) => c.scryfallId));
      const sbIds = new Set((initialSideboard ?? []).map((c) => c.scryfallId));
      const missing = pool.filter((c) => !baseIds.has(c.scryfallId) && !sbIds.has(c.scryfallId));
      return [...base, ...missing];
    }
    return initialDeck ?? [];
  });
  const [sideboard, setSideboard] = useState<CardReference[]>(
    isMidDraft ? (initialSideboard ?? []) : (initialSideboard ?? (initialDeck ? [] : [...pool]))
  );
  const [lands, setLands] = useState<BasicLandCounts>(
    initialLands ?? { ...EMPTY_LANDS }
  );
  const [sortMode, setSortMode] = useState<SortMode>("cmc");
  const [previewState, setPreviewState] = useState<{
    card: CardReference;
    zone: "deck" | "sideboard";
  } | null>(null);
  const [previewFlipped, setPreviewFlipped] = useState(false);
  const [deckName, setDeckName] = useState(initialDeckName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sideboardOpen, setSideboardOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<{
    card: CardReference;
    x: number;
    y: number;
  } | null>(null);

  // In midDraft mode, add newly picked cards to deck automatically
  const knownPoolIdsRef = useRef(new Set(pool.map((c) => c.scryfallId)));
  useEffect(() => {
    if (!isMidDraft) return;
    const newCards = pool.filter((c) => !knownPoolIdsRef.current.has(c.scryfallId));
    knownPoolIdsRef.current = new Set(pool.map((c) => c.scryfallId));
    if (newCards.length > 0) {
      setDeck((prev) => [...prev, ...newCards]);
    }
  }, [pool, isMidDraft]);

  // --- Derived ---

  const totalLands = totalLandCount(lands);
  const mainCount = deck.length + totalLands;
  const sortedDeck = useMemo(() => sortCards(deck, sortMode), [deck, sortMode]);
  const sortedSideboard = useMemo(
    () => sortCards(sideboard, sortMode),
    [sideboard, sortMode]
  );

  const creatureCount = useMemo(() => deck.filter(isCreature).length, [deck]);
  const nonCreatureCount = deck.length - creatureCount;

  // Color percentages based on deck cards
  const colorPercentages = useMemo(() => {
    const counts: Record<ManaColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    for (const card of deck) {
      for (const color of card.colors) {
        if (MANA_COLORS.includes(color)) {
          counts[color]++;
        }
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return null;
    return MANA_COLORS
      .map((c) => ({ color: c, pct: Math.round((counts[c] / total) * 100) }))
      .filter((x) => x.pct > 0);
  }, [deck]);

  // --- Auto-save on change (debounced) ---

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialRef = useRef(true);

  useEffect(() => {
    // Skip the initial render
    if (isInitialRef.current) {
      isInitialRef.current = false;
      return;
    }
    if (!onDeckChange) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      onDeckChange(deck, sideboard, lands, deckName || undefined);
    }, 1000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [deck, sideboard, lands, deckName, onDeckChange]);

  // --- Actions ---

  const moveToSideboard = useCallback((card: CardReference) => {
    setDeck((prev) => {
      const idx = prev.findIndex((c) => c.scryfallId === card.scryfallId);
      if (idx === -1) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
    setSideboard((prev) => [...prev, card]);
    setError(null);
  }, []);

  const moveToDeck = useCallback((card: CardReference) => {
    setSideboard((prev) => {
      const idx = prev.findIndex((c) => c.scryfallId === card.scryfallId);
      if (idx === -1) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
    setDeck((prev) => [...prev, card]);
    setError(null);
  }, []);

  const adjustLand = useCallback((color: ManaColor, delta: number) => {
    setLands((prev) => ({
      ...prev,
      [color]: Math.max(0, prev[color] + delta),
    }));
    setError(null);
  }, []);

  const suggestLands = useCallback(() => {
    const totalTarget = 17;
    const counts: Record<ManaColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    for (const card of deck) {
      for (const color of card.colors) {
        if (MANA_COLORS.includes(color)) {
          counts[color]++;
        }
      }
    }
    const totalSymbols = Object.values(counts).reduce((a, b) => a + b, 0);
    if (totalSymbols === 0) {
      setLands({ ...EMPTY_LANDS });
      return;
    }
    const suggested: BasicLandCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    let assigned = 0;
    const fractional: { color: ManaColor; frac: number }[] = [];
    for (const color of MANA_COLORS) {
      const exact = (counts[color] / totalSymbols) * totalTarget;
      const floored = Math.floor(exact);
      suggested[color] = floored;
      assigned += floored;
      fractional.push({ color, frac: exact - floored });
    }
    fractional.sort((a, b) => b.frac - a.frac);
    let remaining = totalTarget - assigned;
    for (const { color } of fractional) {
      if (remaining <= 0) break;
      if (counts[color] > 0) {
        suggested[color]++;
        remaining--;
      }
    }
    setLands(suggested);
    setError(null);
  }, [deck]);

  const handleSubmit = useCallback(() => {
    if (!onSubmitDeck) return;
    if (mainCount < 40) {
      setError(
        `Deck needs at least 40 cards. Currently ${mainCount} (${deck.length} spells + ${totalLands} lands).`
      );
      return;
    }
    setError(null);
    onSubmitDeck(deck, sideboard, lands, deckName || undefined);
  }, [mainCount, deck, sideboard, lands, totalLands, deckName, onSubmitDeck]);

  const resetSideboard = useCallback(() => {
    setSideboard((prev) => {
      if (prev.length === 0) return prev;
      setDeck((d) => [...d, ...prev]);
      return [];
    });
    setError(null);
  }, []);

  const handlePreviewMove = useCallback(() => {
    if (!previewState) return;
    const { card, zone } = previewState;
    if (zone === "deck") {
      moveToSideboard(card);
    } else {
      moveToDeck(card);
    }
    setPreviewState(null);
  }, [previewState, moveToSideboard, moveToDeck]);

  // --- Render ---

  return (
    <div className={`flex flex-col bg-background ${isMidDraft ? "h-full max-w-5xl mx-auto w-full" : "min-h-dvh"}`}>
      {/* ---- Header ---- */}
      <header className={`sticky ${isMidDraft ? "top-0" : "top-12"} z-20 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">
              {isMidDraft ? "My Deck" : "Build Your Deck"}
            </h1>
            {!isMidDraft && (
              <p className="text-xs text-foreground/50">40 card minimum</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!isMidDraft && (
              <p
                className={`text-sm font-mono font-semibold ${
                  mainCount >= 40 ? "text-success" : "text-warning"
                }`}
              >
                Main: {mainCount}/40
              </p>
            )}
            {isMidDraft && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-2.5 py-1.5 rounded-lg bg-surface text-xs font-medium text-foreground hover:bg-surface-hover transition-colors border border-border"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ---- Scrollable body ---- */}
      <main className={`flex-1 overflow-y-auto px-4 space-y-6 pt-4 ${isMidDraft ? "pb-4" : "pb-32"}`}>
        {/* Deck name + sort */}
        <div className="flex items-center gap-3">
          {!isMidDraft && (
            <input
              type="text"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              placeholder="Deck name (for exports)"
              className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-1 focus:ring-accent"
            />
          )}
          <select
            id="sort-select"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="bg-surface border border-border rounded-lg px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="cmc">Mana Cost</option>
            <option value="color">Color</option>
            <option value="rarity">Rarity</option>
          </select>
        </div>

        {/* ---- Deck Section ---- */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-foreground/60 mb-2">
            Deck ({deck.length} cards)
          </h2>
          {sortedDeck.length === 0 ? (
            <p className="text-sm text-foreground/30 py-4 text-center">
              Tap cards in the sideboard to add them to your deck.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 md:grid-cols-7">
              {sortedDeck.map((card, i) => (
                <CardThumbnail
                  key={`deck-${card.scryfallId}-${i}`}
                  card={card}
                  size="medium"
                  onClick={() =>
                    { setPreviewState({ card, zone: "deck" }); setPreviewFlipped(false); }
                  }
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoverPreview({ card, x: rect.right + 12, y: rect.top });
                  }}
                  onMouseLeave={() => setHoverPreview(null)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ---- Sideboard Section (collapsible) ---- */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => setSideboardOpen((v) => !v)}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground/60 flex-1"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform ${sideboardOpen ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Sideboard ({sideboard.length} cards)
            </button>
            {sideboard.length > 0 && (
              confirmReset ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { resetSideboard(); setConfirmReset(false); }}
                    className="text-xs text-danger font-medium hover:text-danger/80 transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="text-xs text-foreground/40 font-medium hover:text-foreground/60 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="text-xs text-accent font-medium hover:text-accent-hover transition-colors"
                >
                  Move all to deck
                </button>
              )
            )}
          </div>
          {sideboardOpen && (
            <>
              {sortedSideboard.length === 0 ? (
                <p className="text-sm text-foreground/30 py-4 text-center">
                  All cards are in the deck.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 md:grid-cols-7">
                  {sortedSideboard.map((card, i) => (
                    <CardThumbnail
                      key={`sb-${card.scryfallId}-${i}`}
                      card={card}
                      size="medium"
                      onClick={() =>
                        { setPreviewState({ card, zone: "sideboard" }); setPreviewFlipped(false); }
                      }
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoverPreview({ card, x: rect.right + 12, y: rect.top });
                      }}
                      onMouseLeave={() => setHoverPreview(null)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* ---- Color Breakdown ---- */}
        {colorPercentages && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground/60 mb-2">
              Color Breakdown
            </h2>
            <div className="flex items-center justify-between">
              {colorPercentages.map(({ color, pct }) => (
                <span key={color} className="flex items-center gap-1.5 text-sm text-foreground/70">
                  <i className={MANA_ICON_CLASS[color]} style={{ fontSize: "16px" }} />
                  <span>{pct}%</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* ---- Basic Lands Section ---- */}
        {!isMidDraft && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground/60 mb-3">
              Basic Lands ({totalLands})
            </h2>

            <div className="space-y-2">
              {MANA_COLORS.map((color) => (
                <div
                  key={color}
                  className="flex items-center gap-3 bg-surface rounded-lg px-3 py-2"
                >
                  {/* Mana symbol */}
                  <i
                    className={MANA_ICON_CLASS[color]}
                    style={{ fontSize: "18px" }}
                    aria-hidden="true"
                  />

                  {/* Land name */}
                  <span className="text-sm text-foreground flex-1">
                    {LAND_NAMES[color]}
                  </span>

                  {/* Stepper */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => adjustLand(color, -1)}
                      disabled={lands[color] === 0}
                      className="w-7 h-7 rounded-md bg-surface-hover text-foreground text-base font-bold flex items-center justify-center disabled:opacity-30 active:scale-90 transition-transform"
                      aria-label={`Remove one ${LAND_NAMES[color]}`}
                    >
                      -
                    </button>
                    <span className="text-sm font-mono w-5 text-center text-foreground">
                      {lands[color]}
                    </span>
                    <button
                      type="button"
                      onClick={() => adjustLand(color, 1)}
                      className="w-7 h-7 rounded-md bg-surface-hover text-foreground text-base font-bold flex items-center justify-center active:scale-90 transition-transform"
                      aria-label={`Add one ${LAND_NAMES[color]}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={suggestLands}
              className="mt-3 w-full py-2 rounded-lg border border-accent/40 text-accent text-sm font-medium hover:bg-accent/10 active:scale-[0.98] transition-all"
            >
              Suggest lands
            </button>
          </section>
        )}

        {/* ---- Card Types ---- */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-foreground/60 mb-2">
            Card Types
          </h2>
          <div className="bg-surface rounded-lg p-3 flex items-center justify-center gap-6 text-sm text-foreground/70">
            <span>{creatureCount} creatures</span>
            <span className="text-foreground/20">|</span>
            <span>{nonCreatureCount} other spells</span>
          </div>
        </section>

        {/* ---- Mana Curve ---- */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-foreground/60 mb-2">
            Mana Curve
          </h2>
          <div className="bg-surface rounded-lg p-3">
            <ManaCurve cards={deck} />
          </div>
        </section>
      </main>

      {/* ---- Sticky Action Buttons ---- */}
      {!isMidDraft && (
        <footer className="fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur-sm border-t border-border px-4 py-3 space-y-2">
          {error && (
            <p className="text-xs text-danger text-center mb-1">{error}</p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            className="w-full py-3.5 rounded-xl bg-accent text-white font-bold text-base tracking-wide active:scale-[0.97] transition-all hover:bg-accent-hover"
          >
            SUBMIT DECK
          </button>

          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="w-full py-2.5 rounded-xl bg-surface border border-border text-foreground/60 text-sm font-medium active:scale-[0.97] transition-all hover:bg-surface-hover"
            >
              Skip
            </button>
          )}
        </footer>
      )}

      {/* ---- Hover Preview (desktop only) ---- */}
      {hoverPreview && !previewState && (
        <div
          className="fixed z-40 pointer-events-none hidden sm:block"
          style={{
            left: Math.min(hoverPreview.x, window.innerWidth - 280),
            top: Math.max(8, Math.min(hoverPreview.y, window.innerHeight - 400)),
          }}
        >
          <div className="relative w-[250px] card-aspect rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
            <Image
              src={hoverPreview.card.imageUri}
              alt={hoverPreview.card.name}
              fill
              sizes="250px"
              className="object-cover"
            />
          </div>
        </div>
      )}

      {/* ---- Card Preview Modal ---- */}
      {previewState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => { setPreviewState(null); setPreviewFlipped(false); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setPreviewState(null); setPreviewFlipped(false); }
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`Preview of ${previewState.card.name}`}
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
              onClick={() => { setPreviewState(null); setPreviewFlipped(false); }}
              className="w-10 h-1 rounded-full bg-foreground/30 shrink-0 cursor-pointer"
              aria-label="Close preview"
            />

            {/* Large card image */}
            <div className="relative w-[85vw] max-w-[400px] card-aspect rounded-xl overflow-hidden">
              <Image
                src={previewFlipped && previewState.card.backImageUri ? previewState.card.backImageUri : previewState.card.imageUri}
                alt={previewState.card.name}
                fill
                sizes="(max-width: 768px) 85vw, 400px"
                className="object-cover"
                priority
              />
            </div>

            {/* Action buttons */}
            <div className="w-full max-w-[400px] flex flex-col gap-2">
              {previewState.card.backImageUri && (
                <button
                  type="button"
                  onClick={() => setPreviewFlipped((v) => !v)}
                  className="w-full py-3 rounded-xl bg-surface border border-border text-foreground font-medium text-sm active:scale-[0.97] transition-all hover:bg-surface-hover"
                >
                  {previewFlipped ? "Show Front" : "Show Back"}
                </button>
              )}
              <button
                type="button"
                onClick={handlePreviewMove}
                className="w-full py-3 rounded-xl bg-surface border border-border text-foreground font-medium text-sm active:scale-[0.97] transition-all hover:bg-surface-hover"
              >
                {previewState.zone === "deck"
                  ? "Move to Sideboard"
                  : "Move to Deck"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
