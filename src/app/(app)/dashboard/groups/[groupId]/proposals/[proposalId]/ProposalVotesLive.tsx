"use client";

import { useRouter } from "next/navigation";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";

export default function ProposalVotesLive({
  proposalId,
  children,
}: {
  proposalId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  useRealtimeChannel(
    `proposal:${proposalId}:votes`,
    (channel) => {
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "proposal_votes",
            filter: `proposal_id=eq.${proposalId}`,
          },
          () => {
            router.refresh();
          }
        )
        .subscribe();
    },
    [proposalId]
  );

  return <>{children}</>;
}
