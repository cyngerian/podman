import { joinGroupByInviteCode } from "../actions";

export default async function JoinGroupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-6">
      <h1 className="text-xl font-bold">Join Group</h1>

      {error && (
        <p className="rounded-lg bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <form action={joinGroupByInviteCode} className="space-y-4">
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
          className="w-full rounded-xl bg-accent py-3 text-base font-semibold text-white hover:bg-accent-hover transition-colors"
        >
          Join Group
        </button>
      </form>
    </div>
  );
}
