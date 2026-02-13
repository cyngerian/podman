import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient, getUser } from "@/lib/supabase-server";
import { leaveGroup } from "../actions";
import CopyInviteCode from "./CopyInviteCode";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const user = await getUser();

  if (!user) redirect("/auth/login");

  const supabase = await createServerSupabaseClient();

  // Run all queries in parallel
  const [
    { data: group },
    { data: members },
    { data: proposals },
    { data: drafts },
  ] = await Promise.all([
    supabase.from("groups").select("*").eq("id", groupId).single(),
    supabase
      .from("group_members")
      .select("user_id, role, joined_at, profiles(display_name)")
      .eq("group_id", groupId)
      .order("joined_at", { ascending: true }),
    supabase
      .from("draft_proposals")
      .select("id, title, format, player_count, status, created_at, proposed_by, profiles!draft_proposals_proposed_by_fkey(display_name)")
      .eq("group_id", groupId)
      .in("status", ["open", "confirmed"])
      .order("created_at", { ascending: false }),
    supabase
      .from("drafts")
      .select("id, format, set_code, set_name, status, created_at, draft_players(count)")
      .eq("group_id", groupId)
      .in("status", ["lobby", "active", "deck_building"])
      .order("created_at", { ascending: false }),
  ]);

  if (!group) notFound();

  const memberList = (members ?? []).map((m) => ({
    userId: m.user_id,
    role: m.role,
    displayName: m.profiles?.display_name ?? "Unknown",
  }));

  const currentMember = memberList.find((m) => m.userId === user.id);
  const isAdmin = currentMember?.role === "admin";

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-8">
      {/* Group Header */}
      <div>
        <h1 className="text-xl font-bold">{group.name}</h1>
        {group.description && (
          <p className="mt-1 text-sm text-foreground/50">{group.description}</p>
        )}
      </div>

      {/* Invite Code */}
      <section>
        <h2 className="text-sm font-medium text-foreground/70 uppercase tracking-wide mb-2">
          Invite Code
        </h2>
        <CopyInviteCode code={group.invite_code} />
      </section>

      {/* Members */}
      <section>
        <h2 className="text-sm font-medium text-foreground/70 uppercase tracking-wide mb-3">
          Members ({memberList.length})
        </h2>
        <div className="space-y-2">
          {memberList.map((member) => (
            <div
              key={member.userId}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                member.userId === user.id
                  ? "border-accent/40 bg-accent/5"
                  : "border-border bg-surface"
              }`}
            >
              <span className="flex-1 text-sm font-medium truncate">
                {member.displayName}
                {member.userId === user.id && (
                  <span className="text-foreground/40 ml-1">(you)</span>
                )}
              </span>
              {member.role === "admin" && (
                <span className="text-xs text-warning font-medium uppercase tracking-wide">
                  Admin
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Active Drafts */}
      {drafts && drafts.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-foreground/70 uppercase tracking-wide mb-3">
            Active Drafts
          </h2>
          <div className="space-y-2">
            {drafts.map((draft) => {
              const playerCount = draft.draft_players?.[0]?.count ?? 0;
              return (
                <Link
                  key={draft.id}
                  href={`/draft/${draft.id}`}
                  className="block rounded-lg border border-border bg-surface p-3 hover:border-border-light transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {draft.format === "standard"
                        ? draft.set_name ?? draft.set_code ?? "Standard"
                        : draft.format === "winston"
                          ? "Winston Draft"
                          : "Cube Draft"}
                    </span>
                    <span className="text-xs text-foreground/40 uppercase">
                      {draft.status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/40 mt-1">
                    {playerCount} player{playerCount !== 1 ? "s" : ""} &middot;{" "}
                    {new Date(draft.created_at).toLocaleDateString()}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Proposals */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-foreground/70 uppercase tracking-wide">
            Proposals
          </h2>
          <Link
            href={`/dashboard/groups/${groupId}/propose`}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition-colors"
          >
            Propose Draft
          </Link>
        </div>
        {(!proposals || proposals.length === 0) ? (
          <p className="text-sm text-foreground/40">No active proposals.</p>
        ) : (
          <div className="space-y-2">
            {proposals.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/groups/${groupId}/proposals/${p.id}`}
                className="block rounded-lg border border-border bg-surface p-3 hover:border-border-light transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{p.title}</span>
                  <span className={`text-xs font-medium uppercase tracking-wide ${
                    p.status === "confirmed" ? "text-success" : "text-foreground/40"
                  }`}>
                    {p.status}
                  </span>
                </div>
                <p className="text-xs text-foreground/40 mt-1">
                  {p.format} &middot; {p.player_count} players &middot; by {p.profiles?.display_name ?? "Unknown"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Actions */}
      <div className="border-t border-border pt-6">
        <form action={leaveGroup}>
          <input type="hidden" name="group_id" value={groupId} />
          <button
            type="submit"
            className="rounded-lg border border-danger/40 px-4 py-2 text-sm text-danger hover:bg-danger/10 transition-colors"
          >
            Leave Group
          </button>
        </form>
      </div>
    </div>
  );
}
