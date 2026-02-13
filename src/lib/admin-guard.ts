import { redirect } from "next/navigation";
import { createServerSupabaseClient, getUser } from "@/lib/supabase-server";

/**
 * Checks that the current user is a site admin.
 * Redirects to /dashboard if not authenticated or not admin.
 * Returns the authenticated user on success.
 */
export async function requireSiteAdmin() {
  const user = await getUser();
  if (!user) redirect("/auth/login");

  const supabase = await createServerSupabaseClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_site_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_site_admin) redirect("/dashboard");

  return user;
}
