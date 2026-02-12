"use client";

import { useTransition, useState } from "react";
import { joinGroupByInviteCode } from "../actions";

export default function JoinGroupForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await joinGroupByInviteCode(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <>
      {error && (
        <p className="rounded-lg bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="invite_code" className="block text-sm font-medium text-foreground/70 mb-1">
            Invite Code
          </label>
          <input
            id="invite_code"
            name="invite_code"
            type="text"
            required
            maxLength={10}
            placeholder="ABC123"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm uppercase tracking-widest text-center font-mono placeholder:text-foreground/30 focus:border-accent focus:outline-none"
          />
          <p className="mt-1 text-xs text-foreground/40">
            Ask a group member for their invite code.
          </p>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-xl bg-accent py-3 text-base font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-60"
        >
          {isPending ? "Joining..." : "Join Group"}
        </button>
      </form>
    </>
  );
}
