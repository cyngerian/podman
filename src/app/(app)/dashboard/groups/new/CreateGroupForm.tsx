"use client";

import { useTransition, useState } from "react";
import { createGroup } from "../actions";

export default function CreateGroupForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await createGroup(formData);
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
          <label htmlFor="name" className="block text-sm font-medium text-foreground/70 mb-1">
            Group Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={50}
            placeholder="Friday Night Drafts"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm placeholder:text-foreground/30 focus:border-accent focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="emoji" className="block text-sm font-medium text-foreground/70 mb-1">
            Emoji
            <span className="text-foreground/40 font-normal ml-1">(optional)</span>
          </label>
          <input
            id="emoji"
            name="emoji"
            type="text"
            maxLength={8}
            placeholder="🎲"
            className="w-20 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-center placeholder:text-foreground/30 focus:border-accent focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-foreground/70 mb-1">
            Description
            <span className="text-foreground/40 font-normal ml-1">(optional)</span>
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={200}
            placeholder="A group for casual MTG drafts..."
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm placeholder:text-foreground/30 focus:border-accent focus:outline-none resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-xl bg-accent py-3 text-base font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-60"
        >
          {isPending ? "Creating..." : "Create Group"}
        </button>
      </form>
    </>
  );
}
