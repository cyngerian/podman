import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import ProposalVotesLive from "./ProposalVotesLive";
import ProposalActions from "./ProposalActions";

const FORMAT_LABELS: Record<string, string> = {
  standard: "Standard Booster",
  winston: "Winston Draft",
  cube: "Cube Draft",
};

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ groupId: string; proposalId: string }>;
}) {
  const { groupId, proposalId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Fetch proposal
  const { data: proposal } = await supabase
    .from("draft_proposals")
    .select("*, profiles!draft_proposals_proposed_by_fkey(display_name)")
    .eq("id", proposalId)
    .single();

  if (!proposal) notFound();

  // Fetch votes with profile names
  const { data: votes } = await supabase
    .from("proposal_votes")
    .select("user_id, vote, profiles!proposal_votes_user_id_fkey(display_name)")
    .eq("proposal_id", proposalId)
    .order("voted_at", { ascending: true });

  const voteList = (votes ?? []).map((v) => ({
    userId: v.user_id,
    vote: v.vote,
    displayName: v.profiles?.display_name ?? "Unknown",
  }));

  const userVote = voteList.find((v) => v.userId === user.id)?.vote ?? null;
  const inCount = voteList.filter((v) => v.vote === "in").length;
  const isProposer = proposal.proposed_by === user.id;
  const canConvert = proposal.status === "confirmed" && isProposer;

  const rawConfig = (proposal.config ?? {}) as Record<string, unknown>;
  const config = {
    pacingMode: rawConfig.pacingMode as string | undefined,
    timerPreset: rawConfig.timerPreset as string | undefined,
    deckBuildingEnabled: rawConfig.deckBuildingEnabled as boolean | undefined,
    pickHistoryPublic: rawConfig.pickHistoryPublic as boolean | undefined,
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">{proposal.title}</h1>
        <p className="text-sm text-foreground/50 mt-1">
          Proposed by {proposal.profiles?.display_name ?? "Unknown"}
        </p>
      </div>

      {/* Status */}
      <div className={`inline-block rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide ${
        proposal.status === "confirmed"
          ? "bg-success/20 text-success"
          : proposal.status === "cancelled" || proposal.status === "drafted"
            ? "bg-foreground/10 text-foreground/50"
            : "bg-warning/20 text-warning"
      }`}>
        {proposal.status}
      </div>

      {/* Config Summary */}
      <section className="grid grid-cols-2 gap-2">
        <ConfigItem label="Format" value={FORMAT_LABELS[proposal.format] ?? proposal.format} />
        <ConfigItem label="Players" value={String(proposal.player_count)} />
        {proposal.set_name && <ConfigItem label="Set" value={proposal.set_name} />}
        {config.pacingMode && (
          <ConfigItem
            label="Pacing"
            value={config.pacingMode === "realtime" ? "Real-time" : "Async"}
          />
        )}
        {config.timerPreset && config.pacingMode === "realtime" && (
          <ConfigItem label="Timer" value={String(config.timerPreset)} />
        )}
        {config.deckBuildingEnabled !== undefined && (
          <ConfigItem
            label="Deck Building"
            value={config.deckBuildingEnabled ? "On" : "Off"}
          />
        )}
      </section>

      {/* Votes */}
      <section>
        <h2 className="text-sm font-medium text-foreground/70 uppercase tracking-wide mb-3">
          Votes ({inCount}/{proposal.player_count} needed)
        </h2>

        <ProposalVotesLive proposalId={proposalId}>
          <div className="space-y-2">
            {voteList.map((v) => (
              <div
                key={v.userId}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-2.5"
              >
                <span className="text-sm font-medium">
                  {v.displayName}
                  {v.userId === user.id && (
                    <span className="text-foreground/40 ml-1">(you)</span>
                  )}
                </span>
                <span className={`text-xs font-semibold uppercase ${
                  v.vote === "in"
                    ? "text-success"
                    : v.vote === "out"
                      ? "text-danger"
                      : "text-warning"
                }`}>
                  {v.vote}
                </span>
              </div>
            ))}
          </div>
        </ProposalVotesLive>
      </section>

      {/* Interactive Actions (vote, convert, cancel) */}
      <ProposalActions
        proposalId={proposalId}
        groupId={groupId}
        status={proposal.status}
        userVote={userVote}
        isProposer={isProposer}
        canConvert={canConvert}
      />
    </div>
  );
}

function ConfigItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <span className="block text-xs text-foreground/40">{label}</span>
      <span className="block text-sm font-medium">{value}</span>
    </div>
  );
}
