"use server";

import { createServerSupabaseClient, getUser } from "@/lib/supabase-server";

export async function updateProfile(formData: FormData) {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const displayName = (formData.get("display_name") as string)?.trim();
  if (!displayName || displayName.length === 0) {
    return { error: "Display name is required" };
  }

  const avatarUrl = (formData.get("avatar_url") as string) || null;
  const bio = (formData.get("bio") as string) ?? "";
  const favoriteColor = (formData.get("favorite_color") as string) || null;

  // Validate favorite_color
  if (favoriteColor && !["W", "U", "B", "R", "G"].includes(favoriteColor)) {
    return { error: "Invalid favorite color" };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      avatar_url: avatarUrl,
      bio,
      favorite_color: favoriteColor,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };
}
