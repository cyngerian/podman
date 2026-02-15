"use client";

import { useState } from "react";
import type { Draft } from "@/lib/types";
import UserAvatar from "@/components/ui/UserAvatar";

interface DraftLobbyProps {
  draft: Draft;
  currentUserId: string;
  isHost: boolean;
  onStartDraft: () => void;
  onLeaveDraft: () => void;
  playerProfiles?: Record<string, { avatarUrl: string | null; favoriteColor: string | null }>;
}

const FORMAT_LABELS: Record<string, string> = {
  standard: "Standard Booster",
  winston: "Winston Draft",
  cube: "Cube Draft",
};

const PACING_LABELS: Record<string, string> = {
  realtime: "Real-time",
  async: "Async",
};

const TIMER_LABELS: Record<string, string> = {
  relaxed: "Relaxed (1.5x)",
  competitive: "Competitive",
  speed: "Speed (0.5x)",
  none: "No Timer",
};

const STATUS_STYLES: Record<string, string> = {
  proposed: "bg-warning/20 text-warning",
  confirmed: "bg-success/20 text-success",
  active: "bg-accent/20 text-accent",
  deck_building: "bg-accent/20 text-accent",
  complete: "bg-foreground/20 text-foreground/60",
};

export default function DraftLobby({
  draft,
  currentUserId,
  isHost,
  onStartDraft,
  onLeaveDraft,
  playerProfiles,
}: DraftLobbyProps) {
  const [copied, setCopied] = useState(false);

  const joinedCount = draft.seats.length;
  const neededCount = draft.playerCount - joinedCount;
  const canStart = neededCount <= 0;
  const inviteUrl = `podman.app/draft/${draft.id}`;

  function handleCopyLink() {
    navigator.clipboard.writeText(`https://${inviteUrl}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-6 pb-8">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">
            {FORMAT_LABELS[draft.format] ?? draft.format}
            {draft.format === "standard" && draft.setName && (
              <span className="text-foreground/50 font-normal inline-flex items-center gap-1.5 ml-2">
                &mdash;
                {draft.setCode && (
                  <i className={`ss ss-${draft.setCode.toLowerCase()} text-foreground/50`} />
                )}
                {draft.setName}
              </span>
            )}
          </h1>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide ${
            STATUS_STYLES[draft.status] ?? ""
          }`}
        >
          {draft.status.replace("_", " ")}
        </span>
      </div>

      {/* ── Config Summary ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ConfigItem label="Pacing" value={PACING_LABELS[draft.pacingMode]} />
        <ConfigItem
          label="Timer"
          value={
            draft.pacingMode === "realtime"
              ? TIMER_LABELS[draft.timerPreset]
              : "N/A"
          }
        />
        <ConfigItem label="Players" value={`${draft.playerCount}`} />
        <ConfigItem
          label="Deck Building"
          value={draft.deckBuildingEnabled ? "On" : "Off"}
        />
      </div>

      {/* ── Players ── */}
      <section>
        <h2 className="text-sm font-medium text-foreground/70 uppercase tracking-wide mb-3">
          Players
        </h2>
        <div className="space-y-2">
          {Array.from({ length: draft.playerCount }, (_, i) => {
            const seat = draft.seats[i] ?? null;
            const isHostSeat = seat?.userId === draft.hostId;

            if (seat) {
              return (
                <div
                  key={seat.userId}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                    seat.userId === currentUserId
                      ? "border-accent/40 bg-accent/5"
                      : "border-border bg-surface"
                  }`}
                >
                  <UserAvatar
                    avatarUrl={playerProfiles?.[seat.userId]?.avatarUrl ?? null}
                    displayName={seat.displayName}
                    size="sm"
                    favoriteColor={playerProfiles?.[seat.userId]?.favoriteColor ?? null}
                  />
                  <span className="flex-1 text-sm font-medium truncate">
                    {seat.displayName}
                    {seat.userId === currentUserId && (
                      <span className="text-foreground/40 ml-1">(you)</span>
                    )}
                  </span>
                  {isHostSeat && (
                    <span title="Host">
                      <svg
                        className="h-4 w-4 text-warning"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M2 10l4-6 4 4 4-4 4 6H2zm0 2h16v2a1 1 0 01-1 1H3a1 1 0 01-1-1v-2z" />
                      </svg>
                    </span>
                  )}
                </div>
              );
            }

            return (
              <div
                key={`empty-${i}`}
                className="flex items-center gap-3 rounded-lg border-2 border-dashed border-border px-4 py-3"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-border/50 text-xs font-bold tabular-nums text-foreground/40">
                  {i + 1}
                </span>
                <span className="text-sm text-foreground/30">
                  Waiting for player...
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Share / Invite ── */}
      <section>
        <h2 className="text-sm font-medium text-foreground/70 uppercase tracking-wide mb-3">
          Invite Players
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground/60 font-mono truncate select-all">
            {inviteUrl}
          </div>
          <button
            type="button"
            onClick={handleCopyLink}
            className="shrink-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-hover transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </section>

      {/* ── Status Indicator ── */}
      <div className="text-center">
        {canStart ? (
          <p className="text-sm font-medium text-success">Ready to start!</p>
        ) : (
          <p className="text-sm text-foreground/50">
            Waiting for {neededCount} more player{neededCount !== 1 && "s"}...
          </p>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="flex flex-col gap-3">
        {isHost ? (
          <button
            type="button"
            onClick={onStartDraft}
            disabled={!canStart}
            className="w-full rounded-xl bg-accent py-3.5 text-base font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
            title={canStart ? undefined : "Not enough players to start"}
          >
            Start Draft
          </button>
        ) : (
          <button
            type="button"
            onClick={onLeaveDraft}
            className="w-full rounded-xl border-2 border-danger/40 py-3.5 text-base font-semibold text-danger transition-colors hover:bg-danger/10"
          >
            Leave Draft
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Helper Component ── */

function ConfigItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <span className="block text-xs text-foreground/40">{label}</span>
      <span className="block text-sm font-medium">{value}</span>
    </div>
  );
}
