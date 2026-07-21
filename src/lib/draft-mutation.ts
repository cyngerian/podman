import { createAdminClient } from "@/lib/supabase-admin";
import type { Draft, CardReference } from "@/lib/types";
import type { Json } from "@/lib/database.types";

export const MAX_MUTATION_ATTEMPTS = 3;

export type DraftMutationOpts = {
  updateStatus?: boolean;
  updateStartedAt?: boolean;
  updateCompletedAt?: boolean;
  clearCompletedAt?: boolean;
};

export type DraftMutationResult = {
  success: boolean;
  draft?: Draft;
  error?: string;
};

/**
 * Apply a mutation to draft state with optimistic concurrency control.
 * Uses admin client to bypass RLS (since only host can update drafts via RLS).
 *
 * The update is guarded by `.eq("version", currentVersion)` — if another writer
 * bumped the version in between the read and the write, the update matches zero
 * rows and we re-read and re-apply the mutation, up to MAX_MUTATION_ATTEMPTS.
 */
export async function applyDraftMutation(
  draftId: string,
  mutate: (draft: Draft, allPacks: CardReference[][] | null) => Draft,
  opts?: DraftMutationOpts
): Promise<DraftMutationResult> {
  const admin = createAdminClient();

  for (let attempt = 0; attempt < MAX_MUTATION_ATTEMPTS; attempt++) {
    const { data, error } = await admin
      .from("drafts")
      .select("state, config, version, status")
      .eq("id", draftId)
      .single();

    if (error || !data) {
      return { success: false, error: error?.message ?? "Draft not found" };
    }

    const currentVersion = data.version;
    const state = data.state as unknown as Draft;
    const config = data.config as Record<string, unknown>;
    const allPacks = (config.allPacks as CardReference[][] | undefined) ?? null;

    if (!state) {
      return { success: false, error: "Draft has no state" };
    }

    let updatedDraft: Draft;
    try {
      updatedDraft = mutate(state, allPacks);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Mutation failed" };
    }

    const updatePayload: Record<string, unknown> = {
      state: updatedDraft as unknown as Json,
      version: currentVersion + 1,
    };

    if (opts?.updateStatus) {
      updatePayload.status = updatedDraft.status;
    }
    if (opts?.updateStartedAt && updatedDraft.startedAt) {
      updatePayload.started_at = new Date(updatedDraft.startedAt).toISOString();
    }
    if (opts?.updateCompletedAt && updatedDraft.completedAt) {
      updatePayload.completed_at = new Date(updatedDraft.completedAt).toISOString();
    }
    if (opts?.clearCompletedAt && !updatedDraft.completedAt) {
      updatePayload.completed_at = null;
    }

    const { error: updateError, count } = await admin
      .from("drafts")
      .update(updatePayload)
      .eq("id", draftId)
      .eq("version", currentVersion);

    // If count is 0, version mismatch — retry
    if (count === 0 && !updateError) {
      continue;
    }

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true, draft: updatedDraft };
  }

  return { success: false, error: `Version conflict after ${MAX_MUTATION_ATTEMPTS} retries` };
}
