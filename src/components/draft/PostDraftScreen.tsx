"use client";

import { useState, useCallback, useMemo } from "react";
import type { CardReference, BasicLandCounts, DraftPick } from "@/lib/types";
import {
  formatDeckListText,
  formatPoolText,
  formatCockatriceXml,
  downloadFile,
  copyToClipboard,
} from "@/lib/export";
import CardThumbnail from "@/components/ui/CardThumbnail";

interface PostDraftScreenProps {
  pool: CardReference[];
  deck: CardReference[] | null;
  sideboard: CardReference[] | null;
  lands: BasicLandCounts | null;
  pickHistory?: DraftPick[];
  allPlayersHistory?: Array<{
    playerName: string;
    picks: DraftPick[];
  }>;
  onEditDeck?: () => void;
  editingDeck?: boolean;
}

const DEFAULT_LANDS: BasicLandCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };

function isCreature(card: CardReference): boolean {
  return card.typeLine?.toLowerCase().includes("creature") ?? false;
}

export default function PostDraftScreen({
  pool,
  deck,
  sideboard,
  lands,
  pickHistory,
  allPlayersHistory,
  onEditDeck,
  editingDeck,
}: PostDraftScreenProps) {
  const [copiedState, setCopiedState] = useState<string | null>(null);
  const [expandedPlayers, setExpandedPlayers] = useState<Set<number>>(new Set());
  const [showHistory, setShowHistory] = useState(false);

  const hasDeck = deck !== null && sideboard !== null;
  const activeLands = lands ?? DEFAULT_LANDS;

  const statsCards = hasDeck ? deck! : pool;
  const creatureCount = useMemo(() => statsCards.filter(isCreature).length, [statsCards]);
  const nonCreatureCount = statsCards.length - creatureCount;

  // ---- Feedback flash ----
  const flash = useCallback((key: string) => {
    setCopiedState(key);
    setTimeout(() => setCopiedState(null), 2000);
  }, []);

  // ---- Export handlers ----
  const handleCopy = useCallback(async () => {
    const text = hasDeck
      ? formatDeckListText(deck!, sideboard!, activeLands)
      : formatPoolText(pool);
    const ok = await copyToClipboard(text);
    if (ok) flash("clipboard");
  }, [hasDeck, deck, sideboard, activeLands, pool, flash]);

  const handleCockatrice = useCallback(() => {
    if (hasDeck) {
      const xml = formatCockatriceXml(deck!, sideboard!, activeLands);
      downloadFile(xml, "podman-deck.cod", "application/octet-stream");
    } else {
      const xml = formatCockatriceXml(pool, [], DEFAULT_LANDS);
      downloadFile(xml, "podman-pool.cod", "application/octet-stream");
    }
    flash("cockatrice");
  }, [hasDeck, deck, sideboard, activeLands, pool, flash]);

  const handlePlainText = useCallback(() => {
    const text = hasDeck
      ? formatDeckListText(deck!, sideboard!, activeLands)
      : formatPoolText(pool);
    const filename = hasDeck ? "podman-deck.txt" : "podman-pool.txt";
    downloadFile(text, filename, "text/plain");
    flash("text");
  }, [hasDeck, deck, sideboard, activeLands, pool, flash]);

  const togglePlayer = useCallback((idx: number) => {
    setExpandedPlayers((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }, []);

  // ---- Render helpers ----
  function renderCardGrid(cards: CardReference[], label?: string) {
    if (cards.length === 0) return null;
    return (
      <div>
        {label && (
          <h3 className="text-sm font-medium text-foreground/60 mb-2">
            {label} ({cards.length})
          </h3>
        )}
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-1.5">
          {cards.map((card, i) => (
            <CardThumbnail key={`${card.scryfallId}-${i}`} card={card} size="small" />
          ))}
        </div>
      </div>
    );
  }

  function renderExportButton(
    label: string,
    stateKey: string,
    successLabel: string,
    onClick: () => void
  ) {
    const isActive = copiedState === stateKey;
    return (
      <button
        type="button"
        onClick={onClick}
        className={`
          w-full rounded-lg px-4 py-3 text-sm font-medium transition-colors
          ${
            isActive
              ? "bg-success/20 text-success border border-success/40"
              : "bg-surface hover:bg-surface-hover text-foreground border border-border"
          }
        `}
      >
        {isActive ? successLabel : label}
      </button>
    );
  }

  function renderPickRow(pick: DraftPick) {
    return (
      <div
        key={`${pick.packNumber}-${pick.pickInPack}-${pick.cardId}`}
        className="flex items-center gap-3 py-1.5 text-sm"
      >
        <span className="text-foreground/40 w-14 shrink-0 font-mono text-xs">
          P{pick.packNumber}p{pick.pickInPack}
        </span>
        <span className="text-foreground truncate">{pick.cardName}</span>
      </div>
    );
  }

  // ---- Main render ----
  return (
    <div className="min-h-dvh bg-background px-4 py-6 pb-20 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Draft Complete!</h1>
        <p className="text-sm text-foreground/50">
          {hasDeck
            ? `${deck!.length} cards in deck, ${sideboard!.length} in sideboard`
            : `${pool.length} cards in pool`}
        </p>
        <p className="text-xs text-foreground/40">
          {creatureCount} creatures, {nonCreatureCount} other spells
        </p>
        {onEditDeck && (
          <button
            type="button"
            onClick={onEditDeck}
            disabled={editingDeck}
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface border border-border text-sm font-medium text-foreground hover:bg-surface-hover active:scale-[0.97] transition-all disabled:opacity-50"
          >
            {editingDeck ? "Opening..." : "Edit Deck"}
          </button>
        )}
      </div>

      {/* Card Grid */}
      <section className="space-y-4">
        {hasDeck ? (
          <>
            {renderCardGrid(deck!, "Deck")}
            {renderCardGrid(sideboard!, "Sideboard")}
          </>
        ) : (
          renderCardGrid(pool, "Pool")
        )}
      </section>

      {/* Export Section */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Export</h2>
        <div className="space-y-2">
          {renderExportButton(
            "Copy to Clipboard",
            "clipboard",
            "Copied!",
            handleCopy
          )}
          {renderExportButton(
            "Export for Cockatrice (.cod)",
            "cockatrice",
            "Downloaded!",
            handleCockatrice
          )}
          {renderExportButton(
            "Plain Text (.txt)",
            "text",
            "Downloaded!",
            handlePlainText
          )}
        </div>
      </section>

      {/* Pick History */}
      {pickHistory && pickHistory.length > 0 && (
        <section className="space-y-2">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-2 text-lg font-semibold text-foreground w-full"
          >
            <svg
              className={`w-4 h-4 transition-transform ${showHistory ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Pick History
          </button>
          {showHistory && (
            <div className="bg-surface rounded-lg border border-border p-4 divide-y divide-border/50">
              {pickHistory.map((pick) => renderPickRow(pick))}
            </div>
          )}
        </section>
      )}

      {/* All Players' Picks — Collapsible Accordion */}
      {allPlayersHistory && allPlayersHistory.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            All Players&apos; Picks
          </h2>

          <div className="space-y-2">
            {allPlayersHistory.map((player, idx) => {
              const isExpanded = expandedPlayers.has(idx);
              return (
                <div
                  key={player.playerName}
                  className="bg-surface rounded-lg border border-border overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => togglePlayer(idx)}
                    className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-foreground hover:bg-surface-hover transition-colors"
                  >
                    <svg
                      className={`w-4 h-4 transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="flex-1 text-left">{player.playerName}</span>
                    <span className="text-foreground/40 text-xs">
                      {player.picks.length} picks
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-3 divide-y divide-border/50">
                      {player.picks.map((pick) => renderPickRow(pick))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
