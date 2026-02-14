import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient, getUser } from "@/lib/supabase-server";
import { leaveGroup } from "../actions";
import InviteLinksSection from "./InviteLinksSection";
import GroupEmojiEditor from "./GroupEmojiEditor";
import UserAvatar from "@/components/ui/UserAvatar";

function formatElapsed(startedAt: number, now: number) {
  const startedStr = `Started ${new Date(startedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  const elapsedMs = now - startedAt;
  const mins = Math.floor(elapsedMs / 60000);
  let elapsedStr: string;
  if (mins < 60) {
    elapsedStr = `${mins}m ago`;
  } else {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    elapsedStr = `${hrs}h ${remMins}m ago`;
  }
  return { startedStr, elapsedStr };
}

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
    { data: invites },
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
      .select("id, format, set_code, set_name, status, created_at, state, draft_players(user_id, profiles(display_name, avatar_url, favorite_color))")
      .eq("group_id", groupId)
      .in("status", ["lobby", "active", "deck_building"])
      .order("created_at", { ascending: false }),
    supabase
      .from("group_invites")
      .select("id, token, expires_at, use_count")
      .eq("group_id", groupId)
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

  // Pre-compute draft display data (server component — Date.now() is safe here)
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const draftDisplayData = (drafts ?? []).map((draft) => {
    const players = draft.draft_players ?? [];
    const isActive = draft.status === "active";
    const state = draft.state as { startedAt?: number } | null;
    const startedAt = state?.startedAt;
    const elapsed = startedAt ? formatElapsed(startedAt, now) : null;
    const MAX_AVATARS = 6;
    return {
      ...draft,
      players,
      isActive,
      elapsed,
      displayPlayers: players.slice(0, MAX_AVATARS),
      overflow: players.length - MAX_AVATARS,
    };
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-8">
      {/* Group Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <GroupEmojiEditor groupId={groupId} currentEmoji={group.emoji} isAdmin={isAdmin} />
          {group.name}
        </h1>
        {group.description && (
          <p className="mt-1 text-sm text-foreground/50">{group.description}</p>
        )}
      </div>

      {/* Active Drafts */}
      {draftDisplayData.length > 0 && (
        <section className="border-t border-border/40 pt-6">
          <h2 className="text-sm font-medium text-foreground/70 uppercase tracking-wide mb-3">
            Active Drafts
          </h2>
          <div className="space-y-2">
            {draftDisplayData.map((draft) => (
              <Link
                key={draft.id}
                href={`/draft/${draft.id}`}
                className={`block rounded-lg border bg-surface p-3 hover:border-border-light transition-colors ${
                  draft.isActive ? "border-green-500" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium inline-flex items-center gap-1.5">
                    {draft.format === "standard" && draft.set_code && (
                      <i className={`ss ss-${draft.set_code.toLowerCase()} text-foreground`} />
                    )}
                    {draft.format === "standard"
                      ? draft.set_name ?? draft.set_code ?? "Standard"
                      : draft.format === "winston"
                        ? "Winston Draft"
                        : "Cube Draft"}
                  </span>
                  <span className={`text-xs font-medium uppercase ${
                    draft.isActive ? "text-green-500" : "text-foreground/40"
                  }`}>
                    {draft.status.replace("_", " ")}
                  </span>
                </div>

                <p className="text-xs text-foreground/40 mt-1">
                  {draft.players.length} player{draft.players.length !== 1 ? "s" : ""}
                  {draft.elapsed && <> &middot; {draft.elapsed.startedStr}</>}
                  {draft.elapsed && <> &middot; {draft.elapsed.elapsedStr}</>}
                  {!draft.elapsed && <> &middot; {new Date(draft.created_at).toLocaleDateString()}</>}
                </p>

                {/* Player avatar row */}
                {draft.players.length > 0 && (
                  <div className="flex items-center mt-2">
                    {draft.displayPlayers.map((p, i) => (
                      <div key={p.user_id} className={i > 0 ? "-ml-2" : ""}>
                        <UserAvatar
                          avatarUrl={p.profiles?.avatar_url ?? null}
                          displayName={p.profiles?.display_name ?? "?"}
                          size="sm"
                          favoriteColor={p.profiles?.favorite_color ?? null}
                        />
                      </div>
                    ))}
                    {draft.overflow > 0 && (
                      <div
                        className="-ml-2 inline-flex items-center justify-center rounded-full bg-surface border border-border text-[10px] font-medium text-foreground/60 shrink-0"
                        style={{ width: 24, height: 24 }}
                      >
                        +{draft.overflow}
                      </div>
                    )}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Propose Draft */}
      <hr className="border-border/40" />
      <Link
        href={`/dashboard/groups/${groupId}/propose`}
        className="block w-full text-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
      >
        Propose Draft
      </Link>

      {/* Proposals */}
      <section className="border-t border-border/40 pt-6">
        <h2 className="text-sm font-medium text-foreground/70 uppercase tracking-wide mb-3">
          Proposals
        </h2>
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

      {/* Members */}
      <section className="border-t border-border/40 pt-6">
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

      {/* Invite Links (admin only) */}
      {isAdmin && (
        <div className="border-t border-border/40 pt-6">
        <InviteLinksSection
          groupId={groupId}
          invites={invites ?? []}
          now={now}
        />
        </div>
      )}

      {/* Actions */}
      <div className="border-t border-border/40 pt-6">
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
