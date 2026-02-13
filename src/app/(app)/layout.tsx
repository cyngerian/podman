import Link from "next/link";
import { createServerSupabaseClient, getUser } from "@/lib/supabase-server";
import UserAvatar from "@/components/ui/UserAvatar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, supabase] = await Promise.all([
    getUser(),
    createServerSupabaseClient(),
  ]);

  let displayName = "User";
  let avatarUrl: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .single();
    displayName = profile?.display_name ?? user.email ?? "User";
    avatarUrl = profile?.avatar_url ?? null;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto w-full flex items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="text-xl font-bold tracking-tight text-foreground">
            podman
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <UserAvatar avatarUrl={avatarUrl} displayName={displayName} size="md" />
              <span className="text-sm text-foreground/60">{displayName}</span>
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground/50 hover:border-border-light hover:text-foreground transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
