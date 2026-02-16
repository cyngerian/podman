import Link from "next/link";
import { getUser, getProfile } from "@/lib/supabase-server";
import UserAvatar from "@/components/ui/UserAvatar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  let displayName = "User";
  let avatarUrl: string | null = null;
  let favoriteColor: string | null = null;
  if (user) {
    const profile = await getProfile(user.id);
    displayName = profile?.display_name ?? user.email ?? "User";
    avatarUrl = profile?.avatar_url ?? null;
    favoriteColor = profile?.favorite_color ?? null;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto w-full flex items-center justify-between px-4 h-12">
          <Link href="/dashboard" className="text-xl font-bold tracking-tight text-foreground">
            podman
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <UserAvatar avatarUrl={avatarUrl} displayName={displayName} size="md" favoriteColor={favoriteColor} />
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
      <main id="main-content" className="flex-1">{children}</main>
    </div>
  );
}
