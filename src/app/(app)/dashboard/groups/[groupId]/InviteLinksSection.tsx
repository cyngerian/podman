"use client";

import { useTransition, useState } from "react";
import { createInviteLinkAction, revokeInviteLinkAction } from "./actions";

interface InviteLink {
  id: string;
  token: string;
  expires_at: string;
  use_count: number;
}

export default function InviteLinksSection({
  groupId,
  invites,
  now,
}: {
  groupId: string;
  invites: InviteLink[];
  now: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await createInviteLinkAction(groupId);
      if (result?.error) setError(result.error);
    });
  }

  function handleRevoke(inviteId: string) {
    setError(null);
    startTransition(async () => {
      const result = await revokeInviteLinkAction(inviteId, groupId);
      if (result?.error) setError(result.error);
    });
  }

  function handleCopy(token: string) {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const activeInvites = invites.filter(
    (inv) => new Date(inv.expires_at).getTime() > now
  );

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-foreground/70 uppercase tracking-wide">
          Invite Links
        </h2>
        <button
          onClick={handleGenerate}
          disabled={isPending}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-60"
        >
          {isPending ? "..." : "Generate Link"}
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {activeInvites.length === 0 ? (
        <p className="text-sm text-foreground/40">
          No active invite links. Generate one to invite people.
        </p>
      ) : (
        <div className="space-y-2">
          {activeInvites.map((inv) => {
            const expiresDate = new Date(inv.expires_at);
            const daysLeft = Math.ceil(
              (expiresDate.getTime() - now) / (1000 * 60 * 60 * 24)
            );

            return (
              <div
                key={inv.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground/40">
                    Expires in {daysLeft}d &middot; {inv.use_count} use{inv.use_count !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleCopy(inv.token)}
                  className="shrink-0 rounded border border-border px-2 py-1 text-xs font-medium hover:bg-surface-hover transition-colors"
                >
                  {copied === inv.token ? "Copied!" : "Copy"}
                </button>
                <button
                  onClick={() => handleRevoke(inv.id)}
                  disabled={isPending}
                  className="shrink-0 rounded border border-danger/30 px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10 transition-colors disabled:opacity-60"
                >
                  Revoke
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
