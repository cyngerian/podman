"use client";

import { useTransition, useState } from "react";
import { signup } from "../actions";

export default function SignupForm({ redirect }: { redirect?: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await signup(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <>
      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {redirect && <input type="hidden" name="redirect" value={redirect} />}

        <div>
          <label
            htmlFor="display_name"
            className="mb-1.5 block text-sm font-medium text-foreground/80"
          >
            Display name
          </label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            required
            minLength={2}
            maxLength={30}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-foreground/40 outline-none transition-colors focus:border-accent"
            placeholder="Your name"
          />
        </div>

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
            autoComplete="new-password"
            minLength={6}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-foreground/40 outline-none transition-colors focus:border-accent"
            placeholder="At least 6 characters"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="mt-2 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? "Creating account..." : "Create account"}
        </button>
      </form>
    </>
  );
}
