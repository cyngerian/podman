import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const displayName = profile?.display_name ?? user.email ?? "there";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Welcome, {displayName}
        </h1>
        <p className="mt-2 text-sm text-foreground/60">
          podman is under construction. Check back soon.
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button
            type="submit"
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground/70 transition-colors hover:border-border-light hover:text-foreground"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
