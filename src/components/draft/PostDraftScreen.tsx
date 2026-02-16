"use client";

import { useState, useCallback, useMemo, type ChangeEvent } from "react";
import Image from "next/image";
import type { CardReference, BasicLandCounts, DraftPick } from "@/lib/types";
import UserAvatar from "@/components/ui/UserAvatar";
import {
  formatDeckListText,
  formatPoolText,
  formatCockatriceXml,
  downloadFile,
  copyToClipboard,
} from "@/lib/export";
import { isCreature } from "@/lib/card-utils";
import CardThumbnail from "@/components/ui/CardThumbnail";

interface PostDraftScreenProps {
  pool: CardReference[];
  deck: CardReference[] | null;
  sideboard: CardReference[] | null;
  lands: BasicLandCounts | null;
  initialDeckName?: string;
  pickHistory?: DraftPick[];
  allPlayersHistory?: Array<{
    playerName: string;
    picks: DraftPick[];
    avatarUrl?: string | null;
    favoriteColor?: string | null;
  }>;
  onEditDeck?: () => void;
  editingDeck?: boolean;
}

const DEFAULT_LANDS: BasicLandCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };

export default function PostDraftScreen({
  pool,
  deck,
  sideboard,
  lands,
  initialDeckName,
  pickHistory,
  allPlayersHistory,
  onEditDeck,
  editingDeck,
}: PostDraftScreenProps) {
  const [copiedState, setCopiedState] = useState<string | null>(null);
  const [expandedPlayers, setExpandedPlayers] = useState<Set<number>>(new Set());
  const [showHistory, setShowHistory] = useState(false);
  const [deckName, setDeckName] = useState(initialDeckName ?? "");
  const [previewCard, setPreviewCard] = useState<CardReference | null>(null);
  const [previewFlipped, setPreviewFlipped] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<{
    card: CardReference;
    x: number;
    y: number;
  } | null>(null);

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
  const exportName = deckName || undefined;

  const handleCopy = useCallback(async () => {
    const text = hasDeck
      ? formatDeckListText(deck!, sideboard!, activeLands, exportName)
      : formatPoolText(pool);
    const ok = await copyToClipboard(text);
    if (ok) flash("clipboard");
  }, [hasDeck, deck, sideboard, activeLands, pool, flash, exportName]);

  const handleCockatrice = useCallback(() => {
    const baseName = exportName ?? (hasDeck ? "podman-deck" : "podman-pool");
    if (hasDeck) {
      const xml = formatCockatriceXml(deck!, sideboard!, activeLands, exportName);
      downloadFile(xml, `${baseName}.cod`, "application/octet-stream");
    } else {
      const xml = formatCockatriceXml(pool, [], DEFAULT_LANDS, exportName);
      downloadFile(xml, `${baseName}.cod`, "application/octet-stream");
    }
    flash("cockatrice");
  }, [hasDeck, deck, sideboard, activeLands, pool, flash, exportName]);

  const handlePlainText = useCallback(() => {
    const text = hasDeck
      ? formatDeckListText(deck!, sideboard!, activeLands, exportName)
      : formatPoolText(pool);
    const baseName = exportName ?? (hasDeck ? "podman-deck" : "podman-pool");
    downloadFile(text, `${baseName}.txt`, "text/plain");
    flash("text");
  }, [hasDeck, deck, sideboard, activeLands, pool, flash, exportName]);

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
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-1.5">
          {cards.map((card, i) => (
            <CardThumbnail
              key={`${card.scryfallId}-${i}`}
              card={card}
              size="medium"
              onClick={() => { setPreviewCard(card); setPreviewFlipped(false); }}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHoverPreview({ card, x: rect.right + 12, y: rect.top });
              }}
              onMouseLeave={() => setHoverPreview(null)}
            />
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
        <input
          type="text"
          value={deckName}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setDeckName(e.target.value)}
          placeholder="Deck name (optional)"
          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-1 focus:ring-accent"
        />
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
                    <UserAvatar
                      avatarUrl={player.avatarUrl ?? null}
                      displayName={player.playerName}
                      size="sm"
                      favoriteColor={player.favoriteColor ?? null}
                    />
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

      {/* ---- Hover Preview (desktop only) ---- */}
      {hoverPreview && !previewCard && (
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
      {previewCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => { setPreviewCard(null); setPreviewFlipped(false); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setPreviewCard(null); setPreviewFlipped(false); }
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`Preview of ${previewCard.name}`}
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
              onClick={() => { setPreviewCard(null); setPreviewFlipped(false); }}
              className="w-10 h-1 rounded-full bg-foreground/30 shrink-0 cursor-pointer"
              aria-label="Close preview"
            />

            {/* Large card image */}
            <div className="relative w-[85vw] max-w-[400px] card-aspect rounded-xl overflow-hidden">
              <Image
                src={previewFlipped && previewCard.backImageUri ? previewCard.backImageUri : previewCard.imageUri}
                alt={previewCard.name}
                fill
                sizes="(max-width: 768px) 85vw, 400px"
                className="object-cover"
                priority
              />
            </div>

            {/* Action buttons */}
            {previewCard.backImageUri && (
              <button
                type="button"
                onClick={() => setPreviewFlipped((v) => !v)}
                className="w-full max-w-[400px] py-3 rounded-xl bg-surface border border-border text-foreground font-medium text-sm active:scale-[0.97] transition-all hover:bg-surface-hover"
              >
                {previewFlipped ? "Show Front" : "Show Back"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
