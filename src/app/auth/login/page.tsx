import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;

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
          <LoginForm redirect={redirect} />

          <p className="mt-4 text-center text-sm text-foreground/50">
            Don&apos;t have an account?{" "}
            <a
              href={`/auth/signup${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`}
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
