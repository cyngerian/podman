import type { Metadata } from "next";
import SignupForm from "./SignupForm";

export const metadata: Metadata = {
  title: "Sign Up",
};

export default async function SignupPage({
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
            Create your account
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6">
          <SignupForm redirect={redirect} />

          <p className="mt-4 text-center text-sm text-foreground/50">
            Already have an account?{" "}
            <a
              href={`/auth/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`}
              className="text-accent hover:text-accent-hover"
            >
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
