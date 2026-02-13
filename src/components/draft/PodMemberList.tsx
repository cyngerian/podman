"use client";

import type { PodMemberStatus } from "@/lib/types";

interface PodMemberListProps {
  members: PodMemberStatus[];
}

export default function PodMemberList({ members }: PodMemberListProps) {
  const sorted = [...members].sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-2">
      {sorted.map((member) => (
        <div
          key={member.position}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-background"
        >
          {/* Avatar initial */}
          <div className="w-8 h-8 rounded-full bg-accent/20 text-accent font-bold text-xs flex items-center justify-center shrink-0">
            {member.displayName.charAt(0).toUpperCase()}
          </div>

          {/* Name + picks */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {member.displayName}
            </p>
            <p className="text-xs text-foreground/50">
              {member.pickCount} {member.pickCount === 1 ? "pick" : "picks"}
            </p>
          </div>

          {/* Status */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div
              className={`w-2 h-2 rounded-full ${
                member.isCurrentlyPicking
                  ? "bg-green-500"
                  : "bg-foreground/20"
              }`}
            />
            <span className="text-xs text-foreground/60">
              {member.isCurrentlyPicking ? (
                member.queuedPacks > 0
                  ? `Picking (+${member.queuedPacks})`
                  : "Picking"
              ) : (
                "Waiting"
              )}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
