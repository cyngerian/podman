"use server";

import { getUser } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

async function assertSiteAdmin() {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("is_site_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_site_admin) throw new Error("Not authorized");
  return user;
}

export async function resetUserPassword(userId: string, newPassword: string) {
  await assertSiteAdmin();

  if (!newPassword || newPassword.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) return { error: error.message };
}

export async function deleteUser(userId: string) {
  const currentUser = await assertSiteAdmin();

  if (userId === currentUser.id) {
    return { error: "Cannot delete yourself" };
  }

  const admin = createAdminClient();

  // Delete profile + related rows (group_members, draft_players)
  // Profile cascades from auth.users deletion, but clean up memberships explicitly
  await admin.from("group_members").delete().eq("user_id", userId);
  await admin.from("draft_players").delete().eq("user_id", userId);
  await admin.from("proposal_votes").delete().eq("user_id", userId);
  await admin.from("profiles").delete().eq("id", userId);

  // Delete the auth user (this is the primary deletion)
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };
}

export async function deleteGroup(groupId: string) {
  await assertSiteAdmin();

  const admin = createAdminClient();

  // Drafts referencing this group need explicit cleanup (FK is nullable, not cascade)
  const { data: drafts } = await admin
    .from("drafts")
    .select("id")
    .eq("group_id", groupId);

  if (drafts && drafts.length > 0) {
    const draftIds = drafts.map((d) => d.id);
    await admin.from("draft_players").delete().in("draft_id", draftIds);
    await admin.from("drafts").delete().in("id", draftIds);
  }

  // Proposals + votes cascade via FK, but clean up explicitly to be safe
  const { data: proposals } = await admin
    .from("draft_proposals")
    .select("id")
    .eq("group_id", groupId);

  if (proposals && proposals.length > 0) {
    const proposalIds = proposals.map((p) => p.id);
    await admin.from("proposal_votes").delete().in("proposal_id", proposalIds);
    await admin.from("draft_proposals").delete().in("id", proposalIds);
  }

  await admin.from("group_members").delete().eq("group_id", groupId);

  const { error } = await admin.from("groups").delete().eq("id", groupId);
  if (error) return { error: error.message };
}

export async function deleteDraft(draftId: string) {
  await assertSiteAdmin();

  const admin = createAdminClient();

  await admin.from("draft_players").delete().eq("draft_id", draftId);

  const { error } = await admin.from("drafts").delete().eq("id", draftId);
  if (error) return { error: error.message };
}
