"use client";

import { useMemo } from "react";
import type { CardReference, ManaColor } from "@/lib/types";
import { MANA_COLORS } from "@/lib/types";
import CardThumbnail from "@/components/ui/CardThumbnail";

interface BetweenPackScreenProps {
  completedPackNumber: number;
  nextPackNumber: number;
  reviewSecondsRemaining: number;
  picks: CardReference[];
  players: Array<{ name: string; ready: boolean }>;
}

const COLOR_VARS: Record<ManaColor | "multicolor" | "colorless", string> = {
  W: "var(--mana-white)",
  U: "var(--mana-blue)",
  B: "var(--mana-black)",
  R: "var(--mana-red)",
  G: "var(--mana-green)",
  multicolor: "var(--mana-gold)",
  colorless: "var(--mana-colorless)",
};

type ColorKey = ManaColor | "multicolor" | "colorless";

function getColorKey(card: CardReference): ColorKey {
  if (card.colors.length === 0) return "colorless";
  if (card.colors.length > 1) return "multicolor";
  return card.colors[0];
}

export default function BetweenPackScreen({
  completedPackNumber,
  nextPackNumber,
  reviewSecondsRemaining,
  picks,
  players,
}: BetweenPackScreenProps) {
  // Cards picked in the completed pack (assume packs are ~14-15 cards)
  const packsPerPack = completedPackNumber === 1 ? picks.length : Math.min(15, picks.length);
  const recentPicks = picks.slice(-packsPerPack);

  const colorBreakdown = useMemo(() => {
    const counts: Partial<Record<ColorKey, number>> = {};
    for (const card of picks) {
      const key = getColorKey(card);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    // Return sorted: WUBRG then multi, colorless — only those with count > 0
    const allKeys: ColorKey[] = [...MANA_COLORS, "multicolor", "colorless"];
    return allKeys
      .filter((k) => (counts[k] ?? 0) > 0)
      .map((k) => ({ key: k, count: counts[k]! }));
  }, [picks]);

  const readyCount = players.filter((p) => p.ready).length;

  return (
    <div className="flex flex-col h-dvh bg-background">
      {/* Header */}
      <header className="flex flex-col items-center gap-2 px-4 pt-6 pb-4 border-b border-border">
        <h1 className="text-2xl font-bold text-foreground">
          Pack {completedPackNumber} Complete!
        </h1>
        <p className="text-sm text-foreground/60">
          Pack {nextPackNumber} opens in{" "}
          <span className="font-mono font-semibold text-accent">
            {reviewSecondsRemaining}s
          </span>
        </p>
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Color breakdown */}
        <section className="px-4 py-4 border-b border-border">
          <h2 className="text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-3">
            Color Breakdown
          </h2>
          <div className="flex flex-wrap gap-3">
            {colorBreakdown.map(({ key, count }) => (
              <div key={key} className="flex items-center gap-1.5">
                <span
                  className="w-4 h-4 rounded-full border border-border-light shrink-0"
                  style={{ backgroundColor: COLOR_VARS[key] }}
                />
                <span className="text-sm text-foreground/80">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Recent picks grid */}
        <section className="px-4 py-4 border-b border-border">
          <h2 className="text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-3">
            Your Picks
          </h2>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
            {recentPicks.map((card, idx) => (
              <CardThumbnail
                key={`${card.scryfallId}-${idx}`}
                card={card}
                size="small"
              />
            ))}
          </div>
        </section>

        {/* Player readiness */}
        <section className="px-4 py-4">
          <h2 className="text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-3">
            Players ({readyCount}/{players.length} ready)
          </h2>
          <div className="flex flex-col gap-2">
            {players.map((player) => (
              <div
                key={player.name}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-surface"
              >
                <span className="text-base">
                  {player.ready ? (
                    <CheckIcon />
                  ) : (
                    <HourglassIcon />
                  )}
                </span>
                <span className={`text-sm ${player.ready ? "text-foreground" : "text-foreground/50"}`}>
                  {player.name}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Bottom status */}
      <div className="px-4 py-3 border-t border-border bg-surface shrink-0 text-center">
        <p className="text-sm text-foreground/50">
          {readyCount < players.length
            ? "Waiting for other players..."
            : "All players ready! Starting soon..."
          }
        </p>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-5 h-5 text-success"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function HourglassIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-5 h-5 text-warning"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
