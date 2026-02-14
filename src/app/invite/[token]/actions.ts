"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function acceptInviteAction(token: string): Promise<{ error: string } | void> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?redirect=${encodeURIComponent(`/invite/${token}`)}`);
  }

  const { data: groupId, error } = await supabase.rpc("accept_group_invite", {
    p_token: token,
  });

  if (error) {
    return { error: error.message };
  }

  redirect(`/dashboard/groups/${groupId}`);
}
