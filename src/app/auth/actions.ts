"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function login(formData: FormData): Promise<{ error: string } | void> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const redirectTo = (formData.get("redirect") as string) || "/";

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect(redirectTo);
}

export async function signup(formData: FormData): Promise<{ error: string } | void> {
  const displayName = (formData.get("display_name") as string).trim();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const redirectTo = (formData.get("redirect") as string) || "/";

  const supabase = await createServerSupabaseClient();

  const { error: signUpError } = await supabase.auth.signUp({
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

  redirect(redirectTo);
}
