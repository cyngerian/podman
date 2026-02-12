"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Draft } from "@/lib/types";
import DraftLobby from "@/components/draft/DraftLobby";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { startDraftAction, leaveDraft } from "../actions";

interface LobbyClientProps {
  draft: Draft;
  draftId: string;
  currentUserId: string;
  isHost: boolean;
}

export default function LobbyClient({
  draft,
  draftId,
  currentUserId,
  isHost,
}: LobbyClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Subscribe to player changes and draft status changes
  useRealtimeChannel(
    `draft:${draftId}:lobby`,
    (channel) => {
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "draft_players",
            filter: `draft_id=eq.${draftId}`,
          },
          () => {
            router.refresh();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "drafts",
            filter: `id=eq.${draftId}`,
          },
          (payload) => {
            const newStatus = (payload.new as { status: string }).status;
            if (newStatus === "active") {
              router.push(`/draft/${draftId}`);
            }
          }
        )
        .subscribe();
    },
    [draftId]
  );

  function handleStartDraft() {
    setError(null);
    startTransition(async () => {
      try {
        await startDraftAction(draftId);
        router.push(`/draft/${draftId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start draft");
      }
    });
  }

  function handleLeaveDraft() {
    startTransition(async () => {
      await leaveDraft(draftId);
    });
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      {isPending && (
        <div className="mb-4 rounded-lg bg-accent/10 border border-accent/30 px-4 py-3 text-sm text-accent">
          {isHost ? "Starting draft... This may take a few seconds while packs are generated." : "Please wait..."}
        </div>
      )}
      <DraftLobby
        draft={draft}
        currentUserId={currentUserId}
        isHost={isHost}
        onStartDraft={handleStartDraft}
        onLeaveDraft={handleLeaveDraft}
      />
    </div>
  );
}
