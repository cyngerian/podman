"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/auth/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/");
}

export async function signup(formData: FormData) {
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
    redirect(
      `/auth/signup?error=${encodeURIComponent("Invalid invite code.")}&code=${encodeURIComponent(inviteCode)}`
    );
  }

  if (invite.claimed_by) {
    redirect(
      `/auth/signup?error=${encodeURIComponent("This invite code has already been used.")}&code=${encodeURIComponent(inviteCode)}`
    );
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    redirect(
      `/auth/signup?error=${encodeURIComponent("This invite code has expired.")}&code=${encodeURIComponent(inviteCode)}`
    );
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
    redirect(
      `/auth/signup?error=${encodeURIComponent(signUpError.message)}&code=${encodeURIComponent(inviteCode)}`
    );
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
