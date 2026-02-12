"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import type { CardReference, BasicLandCounts, ManaColor } from "@/lib/types";
import { MANA_COLORS } from "@/lib/types";
import CardThumbnail from "@/components/ui/CardThumbnail";
import CardPreview from "@/components/ui/CardPreview";
import ManaCurve from "@/components/ui/ManaCurve";

// --- Types ---

type SortMode = "cmc" | "color" | "rarity";

interface DeckBuilderScreenProps {
  pool: CardReference[];
  initialDeck?: CardReference[];
  initialSideboard?: CardReference[];
  initialLands?: BasicLandCounts;
  suggestedLands?: BasicLandCounts;
  onSubmitDeck: (
    deck: CardReference[],
    sideboard: CardReference[],
    lands: BasicLandCounts
  ) => void;
  onSkip?: () => void;
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

const MANA_CSS_VARS: Record<ManaColor, string> = {
  W: "var(--mana-white)",
  U: "var(--mana-blue)",
  B: "var(--mana-black)",
  R: "var(--mana-red)",
  G: "var(--mana-green)",
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

// --- Long Press Hook ---

const LONG_PRESS_MS = 500;

function useLongPress(onLongPress: () => void, onClick: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);

  const start = useCallback(() => {
    isLongPressRef.current = false;
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  }, [onLongPress]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const end = useCallback(() => {
    cancel();
    if (!isLongPressRef.current) {
      onClick();
    }
  }, [cancel, onClick]);

  return {
    onPointerDown: start,
    onPointerUp: end,
    onPointerLeave: cancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

// --- Card Grid Item (with long press) ---

function DeckCardItem({
  card,
  onTap,
  onLongPress,
}: {
  card: CardReference;
  onTap: () => void;
  onLongPress: () => void;
}) {
  const handlers = useLongPress(onLongPress, onTap);

  return (
    <div {...handlers} className="touch-none select-none">
      <CardThumbnail card={card} size="small" />
    </div>
  );
}

// --- Main Component ---

export default function DeckBuilderScreen({
  pool,
  initialDeck,
  initialSideboard,
  initialLands,
  suggestedLands,
  onSubmitDeck,
  onSkip,
}: DeckBuilderScreenProps) {
  const [deck, setDeck] = useState<CardReference[]>(initialDeck ?? []);
  const [sideboard, setSideboard] = useState<CardReference[]>(
    initialSideboard ?? (initialDeck ? [] : [...pool])
  );
  const [lands, setLands] = useState<BasicLandCounts>(
    initialLands ?? { ...EMPTY_LANDS }
  );
  const [sortMode, setSortMode] = useState<SortMode>("cmc");
  const [previewCard, setPreviewCard] = useState<CardReference | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- Derived ---

  const totalLands = totalLandCount(lands);
  const mainCount = deck.length + totalLands;
  const sortedDeck = useMemo(() => sortCards(deck, sortMode), [deck, sortMode]);
  const sortedSideboard = useMemo(
    () => sortCards(sideboard, sortMode),
    [sideboard, sortMode]
  );

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

  const useSuggestedLands = useCallback(() => {
    if (suggestedLands) {
      setLands({ ...suggestedLands });
      setError(null);
    }
  }, [suggestedLands]);

  const handleSubmit = useCallback(() => {
    if (mainCount < 40) {
      setError(
        `Deck needs at least 40 cards. Currently ${mainCount} (${deck.length} spells + ${totalLands} lands).`
      );
      return;
    }
    setError(null);
    onSubmitDeck(deck, sideboard, lands);
  }, [mainCount, deck, sideboard, lands, totalLands, onSubmitDeck]);

  // --- Render ---

  return (
    <div className="flex flex-col min-h-dvh bg-background">
      {/* ---- Header ---- */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">
              Build Your Deck
            </h1>
            <p className="text-xs text-foreground/50">40 card minimum</p>
          </div>
          <div className="text-right">
            <p
              className={`text-sm font-mono font-semibold ${
                mainCount >= 40 ? "text-success" : "text-warning"
              }`}
            >
              Main: {mainCount}/40
            </p>
          </div>
        </div>
      </header>

      {/* ---- Scrollable body ---- */}
      <main className="flex-1 overflow-y-auto px-4 pb-32 space-y-6 pt-4">
        {/* Sort control */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="sort-select"
            className="text-xs text-foreground/50 uppercase tracking-wider"
          >
            Sort
          </label>
          <select
            id="sort-select"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="bg-surface border border-border rounded-lg px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
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
            <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-7 md:grid-cols-9">
              {sortedDeck.map((card, i) => (
                <DeckCardItem
                  key={`deck-${card.scryfallId}-${i}`}
                  card={card}
                  onTap={() => moveToSideboard(card)}
                  onLongPress={() => setPreviewCard(card)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ---- Sideboard Section ---- */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-foreground/60 mb-2">
            Sideboard ({sideboard.length} cards)
          </h2>
          {sortedSideboard.length === 0 ? (
            <p className="text-sm text-foreground/30 py-4 text-center">
              All cards are in the deck.
            </p>
          ) : (
            <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-7 md:grid-cols-9">
              {sortedSideboard.map((card, i) => (
                <DeckCardItem
                  key={`sb-${card.scryfallId}-${i}`}
                  card={card}
                  onTap={() => moveToDeck(card)}
                  onLongPress={() => setPreviewCard(card)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ---- Basic Lands Section ---- */}
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
                {/* Color circle */}
                <span
                  className="w-5 h-5 rounded-full shrink-0 border border-border-light"
                  style={{ backgroundColor: MANA_CSS_VARS[color] }}
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

          {suggestedLands && (
            <button
              type="button"
              onClick={useSuggestedLands}
              className="mt-3 w-full py-2 rounded-lg border border-accent/40 text-accent text-sm font-medium hover:bg-accent/10 active:scale-[0.98] transition-all"
            >
              Use suggested lands
            </button>
          )}
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

      {/* ---- Card Preview Modal ---- */}
      {previewCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setPreviewCard(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setPreviewCard(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`Preview of ${previewCard.name}`}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={() => {}}
            role="presentation"
          >
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
