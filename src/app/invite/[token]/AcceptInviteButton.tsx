"use client";

import { useTransition, useState } from "react";
import { acceptInviteAction } from "./actions";

export default function AcceptInviteButton({ token }: { token: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await acceptInviteAction(token);
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
      <button
        onClick={handleClick}
        disabled={isPending}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {isPending ? "Joining..." : "Join Group"}
      </button>
    </>
  );
}
