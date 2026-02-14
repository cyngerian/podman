import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient, getUser } from "@/lib/supabase-server";
import UserAvatar from "@/components/ui/UserAvatar";

export default async function DashboardPage() {
  const user = await getUser();

  if (!user) redirect("/auth/login");

  const supabase = await createServerSupabaseClient();

  // Fetch profile, group memberships, active simulated drafts, and active group drafts in parallel
  const [{ data: profile }, { data: memberships }, { data: simDrafts }, { data: activeDraftPlayers }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, avatar_url, is_site_admin, favorite_color")
      .eq("id", user.id)
      .single(),
    supabase
      .from("group_members")
      .select("role, group_id, groups(id, name, description, created_at)")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: false }),
    supabase
      .from("drafts")
      .select("id, format, set_name, status, created_at")
      .eq("host_id", user.id)
      .eq("is_simulated", true)
      .in("status", ["active", "deck_building", "complete"])
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("draft_players")
      .select("draft_id, drafts!inner(id, format, set_name, status, created_at, is_simulated, groups(name))")
      .eq("user_id", user.id)
      .eq("drafts.is_simulated", false)
      .in("drafts.status", ["lobby", "active", "deck_building"])
      .order("draft_id", { ascending: false })
      .limit(10),
  ]);

  const activeGroupDrafts = (activeDraftPlayers ?? [])
    .map((dp) => dp.drafts)
    .filter((d): d is NonNullable<typeof d> => d !== null);

  const activeSimDrafts = (simDrafts ?? []).filter((d) => d.status !== "complete");
  const completedSimDrafts = (simDrafts ?? []).filter((d) => d.status === "complete");

  const groups = (memberships ?? []).map((m) => ({
    ...m.groups!,
    role: m.role,
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      {/* Profile row */}
      <div className="flex items-center gap-3">
        <UserAvatar
          avatarUrl={profile?.avatar_url ?? null}
          displayName={profile?.display_name ?? "User"}
          size="md"
          favoriteColor={profile?.favorite_color ?? null}
        />
        <span className="text-sm font-medium text-foreground">
          {profile?.display_name ?? "User"}
        </span>
        <Link
          href="/dashboard/profile"
          className="text-xs text-foreground/40 hover:text-foreground/60 transition-colors"
        >
          Edit Profile
        </Link>
        {profile?.is_site_admin && (
          <Link
            href="/dashboard/admin"
            className="text-xs text-foreground/40 hover:text-foreground/60 transition-colors"
          >
            Admin
          </Link>
        )}
      </div>

      {/* Active Drafts */}
      {activeGroupDrafts.length > 0 && (
        <>
          <h2 className="text-xl font-bold">Active Drafts</h2>
          <div className="space-y-2">
            {activeGroupDrafts.map((draft) => (
              <Link
                key={draft.id}
                href={`/draft/${draft.id}`}
                className={`flex items-center justify-between rounded-xl border bg-surface p-3 hover:border-border-light transition-colors ${
                  draft.status === "active" ? "border-green-500" : "border-border"
                }`}
              >
                <div>
                  <span className="text-sm font-medium">
                    {draft.set_name ?? draft.format}
                  </span>
                  {draft.groups?.name && (
                    <span className="ml-2 text-xs text-foreground/40">
                      {draft.groups.name}
                    </span>
                  )}
                </div>
                <span className="text-xs text-foreground/40">
                  Resume
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Solo Practice */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Solo Practice</h2>
        <Link
          href="/dashboard/simulate"
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
        >
          Simulate Draft
        </Link>
      </div>

      {activeSimDrafts.length > 0 ? (
        <div className="space-y-2">
          {activeSimDrafts.map((draft) => (
            <Link
              key={draft.id}
              href={`/draft/${draft.id}`}
              className={`flex items-center justify-between rounded-xl border bg-surface p-3 hover:border-border-light transition-colors ${
                draft.status === "active" ? "border-green-500" : "border-border"
              }`}
            >
              <div>
                <span className="text-sm font-medium">
                  {draft.set_name ?? draft.format} Simulation
                </span>
              </div>
              <span className="text-xs text-foreground/40">
                Resume
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-foreground/40">
          No active simulations. Start one to practice drafting against bots.
        </p>
      )}

      {completedSimDrafts.length > 0 && (
        <details open>
          <summary className="text-sm font-medium text-foreground/50 cursor-pointer mb-2">
            Completed ({completedSimDrafts.length})
          </summary>
          <div className="space-y-2">
            {completedSimDrafts.map((draft) => (
              <Link
                key={draft.id}
                href={`/draft/${draft.id}`}
                className="flex items-center justify-between rounded-xl border border-border bg-surface p-3 hover:border-border-light transition-colors"
              >
                <div>
                  <span className="text-sm font-medium">
                    {draft.set_name ?? draft.format} Simulation
                  </span>
                  <span className="ml-2 text-xs text-foreground/40">
                    Complete
                  </span>
                </div>
                <span className="text-xs text-foreground/40">
                  View
                </span>
              </Link>
            ))}
          </div>
        </details>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Your Groups</h1>
        <Link
          href="/dashboard/groups/new"
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
        >
          Create Group
        </Link>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border py-12 text-center">
          <p className="text-foreground/50 text-sm">
            You&apos;re not in any groups yet.
          </p>
          <p className="text-foreground/40 text-xs mt-1">
            Create a group or join one with an invite link.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <Link
              key={group.id}
              href={`/dashboard/groups/${group.id}`}
              className="block rounded-xl border border-border bg-surface p-4 hover:border-border-light transition-colors"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">{group.name}</h2>
                <span className="text-xs text-foreground/40 uppercase tracking-wide">
                  {group.role}
                </span>
              </div>
              {group.description && (
                <p className="mt-1 text-sm text-foreground/50 line-clamp-2">
                  {group.description}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
