"use client";

import type { PodMemberStatus, PassDirection } from "@/lib/types";
import UserAvatar from "@/components/ui/UserAvatar";

interface PodMemberListProps {
  members: PodMemberStatus[];
  passDirection: PassDirection;
}

export default function PodMemberList({ members, passDirection }: PodMemberListProps) {
  const sorted = [...members].sort((a, b) => a.position - b.position);
  // "left" = packs flow to increasing position = downward in the list
  // "right" = packs flow to decreasing position = upward in the list
  const arrowDown = passDirection === "left";

  return (
    <div>
      {sorted.map((member, index) => (
        <div key={member.position}>
          {/* Direction arrow between rows */}
          {index > 0 && (
            <div className="flex justify-center py-0.5">
              <DirectionArrow down={arrowDown} />
            </div>
          )}

          {/* Player row */}
          <div
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${
              member.isCurrentUser
                ? "bg-accent/10 ring-1 ring-accent/30"
                : member.isCurrentlyPicking
                  ? "bg-background ring-1 ring-green-500/40"
                  : "bg-background"
            }`}
          >
            {/* Avatar */}
            <UserAvatar
              avatarUrl={member.avatarUrl}
              displayName={member.displayName}
              size="md"
              favoriteColor={member.favoriteColor}
            />

            {/* Name + picks */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {member.displayName}
                {member.isCurrentUser && (
                  <span className="text-xs text-foreground/40 ml-1">(you)</span>
                )}
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
                {member.isCurrentUser
                  ? (member.isCurrentlyPicking ? "Your pick" : "Waiting")
                  : member.isCurrentlyPicking
                    ? member.queuedPacks > 0
                      ? `Picking (+${member.queuedPacks})`
                      : "Picking"
                    : "Waiting"
                }
              </span>
            </div>
          </div>
        </div>
      ))}

      {/* Wrap-around arrow at bottom */}
      {sorted.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-1.5 text-foreground/20">
          <WrapArrow down={arrowDown} />
          <span className="text-[10px]">wraps around</span>
        </div>
      )}
    </div>
  );
}

function DirectionArrow({ down }: { down: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="w-3.5 h-3.5 text-foreground/30"
    >
      {down ? (
        <path fillRule="evenodd" d="M8 1.5a.5.5 0 0 1 .5.5v10.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 0 1 .708-.708L7.5 12.793V2a.5.5 0 0 1 .5-.5Z" clipRule="evenodd" />
      ) : (
        <path fillRule="evenodd" d="M8 14.5a.5.5 0 0 1-.5-.5V3.207L4.354 6.354a.5.5 0 1 1-.708-.708l4-4a.5.5 0 0 1 .708 0l4 4a.5.5 0 0 1-.708.708L8.5 3.207V14a.5.5 0 0 1-.5.5Z" clipRule="evenodd" />
      )}
    </svg>
  );
}

function WrapArrow({ down }: { down: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={`w-3 h-3 ${down ? "" : "rotate-180"}`}
    >
      <path fillRule="evenodd" d="M2 4.5A2.5 2.5 0 0 1 4.5 2h5A2.5 2.5 0 0 1 12 4.5v5.793l1.146-1.147a.5.5 0 0 1 .708.708l-2 2a.5.5 0 0 1-.708 0l-2-2a.5.5 0 0 1 .708-.708L11 10.293V4.5A1.5 1.5 0 0 0 9.5 3h-5A1.5 1.5 0 0 0 3 4.5v6a.5.5 0 0 1-1 0v-6Z" clipRule="evenodd" />
    </svg>
  );
}
