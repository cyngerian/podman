"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function login(formData: FormData): Promise<{ error: string } | void> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}

export async function signup(formData: FormData): Promise<{ error: string } | void> {
  const inviteCode = (formData.get("invite_code") as string).trim();
  const displayName = (formData.get("display_name") as string).trim();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createServerSupabaseClient();

  // Validate invite code exists and is unclaimed
  const { data: invite } = await supabase
    .from("invites")
    .select("*")
    .eq("code", inviteCode)
    .maybeSingle();

  if (!invite) {
    return { error: "Invalid invite code." };
  }

  if (invite.claimed_by) {
    return { error: "This invite code has already been used." };
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return { error: "This invite code has expired." };
  }

  // Create user account
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
      },
    },
  });

  if (signUpError) {
    return { error: signUpError.message };
  }

  // Mark invite as claimed
  if (authData.user) {
    await supabase
      .from("invites")
      .update({ claimed_by: authData.user.id })
      .eq("id", invite.id);
  }

  redirect("/");
}
