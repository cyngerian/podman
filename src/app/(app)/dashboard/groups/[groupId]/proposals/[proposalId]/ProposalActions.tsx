"use client";

import { useTransition, useOptimistic } from "react";
import { voteOnProposal, cancelProposal, convertProposalToDraft } from "../../actions";

interface ProposalActionsProps {
  proposalId: string;
  groupId: string;
  status: string;
  userVote: string | null;
  isProposer: boolean;
  canConvert: boolean;
}

export default function ProposalActions({
  proposalId,
  groupId,
  status,
  userVote,
  isProposer,
  canConvert,
}: ProposalActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticVote, setOptimisticVote] = useOptimistic(userVote);

  function handleVote(voteValue: string) {
    const formData = new FormData();
    formData.set("proposal_id", proposalId);
    formData.set("group_id", groupId);
    formData.set("vote", voteValue);

    setOptimisticVote(voteValue);
    startTransition(async () => {
      await voteOnProposal(formData);
    });
  }

  function handleConvert() {
    const formData = new FormData();
    formData.set("proposal_id", proposalId);
    formData.set("group_id", groupId);

    startTransition(async () => {
      await convertProposalToDraft(formData);
    });
  }

  function handleCancel() {
    const formData = new FormData();
    formData.set("proposal_id", proposalId);
    formData.set("group_id", groupId);

    startTransition(async () => {
      await cancelProposal(formData);
    });
  }

  return (
    <>
      {/* Vote Buttons */}
      {status === "open" && (
        <section className={`flex gap-2 ${isPending ? "opacity-60 pointer-events-none" : ""}`}>
          {(["in", "maybe", "out"] as const).map((voteValue) => (
            <button
              key={voteValue}
              type="button"
              onClick={() => handleVote(voteValue)}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                optimisticVote === voteValue
                  ? voteValue === "in"
                    ? "bg-success text-white"
                    : voteValue === "out"
                      ? "bg-danger text-white"
                      : "bg-warning text-white"
                  : "border border-border bg-surface hover:bg-surface-hover text-foreground/70"
              }`}
            >
              {voteValue === "in" ? "I'm In" : voteValue === "out" ? "Out" : "Maybe"}
            </button>
          ))}
        </section>
      )}

      {/* Convert to Draft */}
      {canConvert && (
        <button
          type="button"
          onClick={handleConvert}
          disabled={isPending}
          className="w-full rounded-xl bg-accent py-3.5 text-base font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-60"
        >
          {isPending ? "Creating Draft..." : "Convert to Draft"}
        </button>
      )}

      {/* Cancel */}
      {isProposer && status === "open" && (
        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="text-sm text-danger hover:underline disabled:opacity-60"
        >
          Cancel proposal
        </button>
      )}
    </>
  );
}
