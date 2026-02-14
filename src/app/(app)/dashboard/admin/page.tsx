import { requireSiteAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase-admin";
import AdminClient from "./AdminClient";

export default async function AdminPage() {
  await requireSiteAdmin();

  const admin = createAdminClient();

  // Fetch all data in parallel
  const [authUsers, { data: profiles }, { data: groups }, { data: drafts }] =
    await Promise.all([
      admin.auth.admin.listUsers(),
      admin.from("profiles").select("id, display_name, avatar_url, is_site_admin"),
      admin
        .from("groups")
        .select("id, name, emoji, created_at, group_members(count)")
        .order("created_at", { ascending: false }),
      admin
        .from("drafts")
        .select("id, format, set_code, set_name, status, created_at, host_id, is_simulated, group_id")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  // Build a profile lookup map
  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p])
  );

  // Merge auth users with profile data
  const users = (authUsers.data?.users ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? "",
    displayName: profileMap.get(u.id)?.display_name ?? null,
    isAdmin: profileMap.get(u.id)?.is_site_admin ?? false,
    createdAt: u.created_at,
  }));

  // Format groups
  const groupList = (groups ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    memberCount:
      (g.group_members as unknown as { count: number }[])?.[0]?.count ?? 0,
    createdAt: g.created_at,
  }));

  // Format drafts with host name
  const draftList = (drafts ?? []).map((d) => ({
    id: d.id,
    format: d.format,
    setCode: d.set_code,
    setName: d.set_name,
    status: d.status,
    hostName: profileMap.get(d.host_id)?.display_name ?? "Unknown",
    isSimulated: d.is_simulated,
    createdAt: d.created_at,
  }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
      <h1 className="text-xl font-bold">Admin Console</h1>
      <AdminClient users={users} groups={groupList} drafts={draftList} />
    </div>
  );
}
