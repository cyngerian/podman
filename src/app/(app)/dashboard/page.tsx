import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient, getUser } from "@/lib/supabase-server";

export default async function DashboardPage() {
  const user = await getUser();

  if (!user) redirect("/auth/login");

  const supabase = await createServerSupabaseClient();

  // Fetch user's group memberships with group info
  const { data: memberships } = await supabase
    .from("group_members")
    .select("role, group_id, groups(id, name, description, invite_code, created_at)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  const groups = (memberships ?? []).map((m) => ({
    ...m.groups!,
    role: m.role,
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Your Groups</h1>
        <div className="flex gap-2">
          <Link
            href="/dashboard/groups/join"
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground/70 hover:border-border-light hover:text-foreground transition-colors"
          >
            Join Group
          </Link>
          <Link
            href="/dashboard/groups/new"
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
          >
            Create Group
          </Link>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border py-12 text-center">
          <p className="text-foreground/50 text-sm">
            You&apos;re not in any groups yet.
          </p>
          <p className="text-foreground/40 text-xs mt-1">
            Create a group or join one with an invite code.
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
