import { login } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            podman
          </h1>
          <p className="mt-2 text-sm text-foreground/60">
            Sign in to your account
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          <form action={login} className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-foreground/80"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-foreground/40 outline-none transition-colors focus:border-accent"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-foreground/80"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                minLength={6}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-foreground/40 outline-none transition-colors focus:border-accent"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              className="mt-2 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Sign in
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-foreground/50">
            Have an invite?{" "}
            <a
              href="/auth/signup"
              className="text-accent hover:text-accent-hover"
            >
              Create an account
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
