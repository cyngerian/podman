import { createGroup } from "../actions";

export default async function NewGroupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-6">
      <h1 className="text-xl font-bold">Create Group</h1>

      {error && (
        <p className="rounded-lg bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <form action={createGroup} className="space-y-4">
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
          className="w-full rounded-xl bg-accent py-3 text-base font-semibold text-white hover:bg-accent-hover transition-colors"
        >
          Create Group
        </button>
      </form>
    </div>
  );
}
