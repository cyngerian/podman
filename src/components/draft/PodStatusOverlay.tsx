"use client";

import type { PodMemberStatus } from "@/lib/types";
import PodMemberList from "./PodMemberList";

interface PodStatusOverlayProps {
  members: PodMemberStatus[];
  isOpen: boolean;
  onClose: () => void;
}

export default function PodStatusOverlay({
  members,
  isOpen,
  onClose,
}: PodStatusOverlayProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative mt-2 flex-1 flex flex-col bg-surface rounded-t-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-lg font-bold text-foreground">
            Pod ({members.length + 1})
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-foreground/60 hover:text-foreground hover:bg-surface-hover transition-colors"
            aria-label="Close"
          >
            <XIcon />
          </button>
        </div>

        {/* Player list */}
        <div className="flex-1 overflow-y-auto p-4">
          <PodMemberList members={members} />
        </div>
      </div>
    </div>
  );
}

function XIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-5 h-5"
    >
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  );
}
