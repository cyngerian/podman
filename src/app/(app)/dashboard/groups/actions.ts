"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createGroup(formData: FormData): Promise<{ error: string } | void> {
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;

  if (!name) {
    return { error: "Group name is required" };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const inviteCode = generateInviteCode();

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .insert({
      name,
      description,
      invite_code: inviteCode,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (groupError || !group) {
    return { error: groupError?.message ?? "Failed to create group" };
  }

  // Add creator as admin member
  await supabase.from("group_members").insert({
    group_id: group.id,
    user_id: user.id,
    role: "admin",
  });

  redirect(`/dashboard/groups/${group.id}`);
}

export async function joinGroupByInviteCode(formData: FormData): Promise<{ error: string } | void> {
  const inviteCode = (formData.get("invite_code") as string)?.trim().toUpperCase();

  if (!inviteCode) {
    return { error: "Invite code is required" };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: groupId, error } = await supabase.rpc(
    "join_group_by_invite_code",
    { p_invite_code: inviteCode }
  );

  if (error) {
    return { error: error.message };
  }

  redirect(`/dashboard/groups/${groupId}`);
}

export async function leaveGroup(formData: FormData) {
  const groupId = formData.get("group_id") as string;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", user.id);

  redirect("/dashboard");
}
