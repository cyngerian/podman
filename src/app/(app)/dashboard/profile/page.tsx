import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient, getUser } from "@/lib/supabase-server";
import ProfileForm from "./ProfileForm";

export const metadata: Metadata = {
  title: "Profile",
};

export default async function ProfilePage() {
  const user = await getUser();
  if (!user) redirect("/auth/login");

  const supabase = await createServerSupabaseClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, bio, favorite_color")
    .eq("id", user.id)
    .single();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      <h1 className="text-xl font-bold">Edit Profile</h1>
      <ProfileForm
        displayName={profile?.display_name ?? ""}
        avatarUrl={profile?.avatar_url ?? null}
        bio={profile?.bio ?? ""}
        favoriteColor={profile?.favorite_color ?? null}
      />
    </div>
  );
}
