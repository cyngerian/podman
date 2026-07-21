import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Draft, CardReference } from "../types";

// The module under test builds its own admin client, so we intercept the factory.
const createAdminClient = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  createAdminClient: () => createAdminClient(),
}));

const { applyDraftMutation, MAX_MUTATION_ATTEMPTS } = await import("../draft-mutation");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: "draft-1",
    groupId: "group-1",
    hostId: "user-1",
    format: "standard",
    pacingMode: "realtime",
    status: "active",
    setCode: "BLB",
    setName: "Bloomburrow",
    cubeList: null,
    cubeSource: null,
    deckBuildingEnabled: true,
    pickHistoryPublic: true,
    playerCount: 8,
    packsPerPlayer: 3,
    cardsPerPack: 14,
    timerPreset: "competitive",
    reviewPeriodSeconds: 0,
    asyncDeadlineMinutes: null,
    currentPack: 1,
    seats: [],
    winstonState: null,
    createdAt: 1_700_000_000_000,
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

type ReadResult = { data: unknown; error: { message: string } | null };
type WriteResult = { count: number | null; error: { message: string } | null };

type RecordedUpdate = {
  payload: Record<string, unknown>;
  opts?: { count?: string };
  filters: Array<[string, unknown]>;
};

type Mutator = (draft: Draft, allPacks: CardReference[][] | null) => Draft;

/**
 * Minimal stand-in for the postgrest builder chains applyDraftMutation uses:
 *   from(t).select(cols).eq(col, v).single()          -> ReadResult
 *   from(t).update(payload).eq(col, v).eq(col, v)     -> WriteResult (thenable)
 *
 * `reads`/`writes` are consumed one entry per attempt; the last entry repeats
 * if the code makes more attempts than were scripted.
 */
function mockAdmin(script: { reads: ReadResult[]; writes?: WriteResult[] }) {
  const tables: string[] = [];
  const reads: Array<[string, unknown]> = [];
  const updates: RecordedUpdate[] = [];
  let readIndex = 0;
  let writeIndex = 0;

  const next = <T>(list: T[] | undefined, index: number): T => {
    if (!list || list.length === 0) throw new Error("mockAdmin: nothing scripted");
    return list[Math.min(index, list.length - 1)];
  };

  const client = {
    from(table: string) {
      tables.push(table);
      return {
        select() {
          return {
            eq(col: string, value: unknown) {
              reads.push([col, value]);
              return {
                async single() {
                  return next(script.reads, readIndex++);
                },
              };
            },
          };
        },
        update(payload: Record<string, unknown>, opts?: { count?: string }) {
          const filters: Array<[string, unknown]> = [];
          const builder = {
            eq(col: string, value: unknown) {
              filters.push([col, value]);
              return builder;
            },
            then<R>(
              onFulfilled: (value: WriteResult) => R,
              onRejected?: (reason: unknown) => R
            ) {
              updates.push({ payload, opts, filters });
              return Promise.resolve(next(script.writes, writeIndex++)).then(
                onFulfilled,
                onRejected
              );
            },
          };
          return builder;
        },
      };
    },
  };

  return {
    client,
    tables,
    reads,
    updates,
    get readCount() {
      return readIndex;
    },
  };
}

function install(script: { reads: ReadResult[]; writes?: WriteResult[] }) {
  const admin = mockAdmin(script);
  createAdminClient.mockReturnValue(admin.client);
  return admin;
}

const ok = (draft: Draft, version: number, config: unknown = {}): ReadResult => ({
  data: { state: draft, config, version, status: draft.status },
  error: null,
});

beforeEach(() => {
  createAdminClient.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("applyDraftMutation — happy path", () => {
  it("reads state, applies the mutation, and writes it back with version + 1", async () => {
    const admin = install({
      reads: [ok(makeDraft(), 7)],
      writes: [{ count: 1, error: null }],
    });

    const result = await applyDraftMutation("draft-1", (draft) => ({
      ...draft,
      currentPack: 2,
    }));

    expect(result.success).toBe(true);
    expect(result.draft?.currentPack).toBe(2);
    expect(result.error).toBeUndefined();

    expect(admin.readCount).toBe(1);
    expect(admin.updates).toHaveLength(1);
    expect(admin.updates[0].payload.version).toBe(8);
    expect((admin.updates[0].payload.state as Draft).currentPack).toBe(2);
    expect(admin.tables.every((t) => t === "drafts")).toBe(true);
  });

  it("guards the write with the version it read (optimistic concurrency)", async () => {
    const admin = install({
      reads: [ok(makeDraft(), 3)],
      writes: [{ count: 1, error: null }],
    });

    await applyDraftMutation("draft-42", (draft) => draft);

    expect(admin.updates[0].filters).toEqual([
      ["id", "draft-42"],
      ["version", 3],
    ]);
  });

  it("requests an exact row count so a lost race is detectable", async () => {
    // Without count: "exact" PostgREST returns count === null even when the
    // version guard matched no rows, and the conflict retry below can never fire.
    const admin = install({
      reads: [ok(makeDraft(), 1)],
      writes: [{ count: 1, error: null }],
    });

    await applyDraftMutation("draft-1", (d) => d);

    expect(admin.updates[0].opts).toEqual({ count: "exact" });
  });

  it("passes config.allPacks through to the mutator", async () => {
    const allPacks: CardReference[][] = [
      [
        {
          scryfallId: "card-1",
          name: "Lightning Bolt",
          imageUri: "https://example.test/bolt.jpg",
          smallImageUri: "https://example.test/bolt-small.jpg",
          rarity: "common",
          colors: ["R"],
          cmc: 1,
          isFoil: false,
        },
      ],
    ];
    install({
      reads: [ok(makeDraft(), 1, { allPacks })],
      writes: [{ count: 1, error: null }],
    });

    const mutate = vi.fn<Mutator>((draft) => draft);
    await applyDraftMutation("draft-1", mutate);

    expect(mutate.mock.calls[0][1]).toEqual(allPacks);
  });

  it("passes null for allPacks when config has none", async () => {
    install({ reads: [ok(makeDraft(), 1)], writes: [{ count: 1, error: null }] });

    const mutate = vi.fn<Mutator>((draft) => draft);
    await applyDraftMutation("draft-1", mutate);

    expect(mutate.mock.calls[0][1]).toBeNull();
  });
});

describe("applyDraftMutation — optional column updates", () => {
  it("omits status/timestamp columns when no opts are given", async () => {
    const admin = install({
      reads: [ok(makeDraft({ startedAt: 1_700_000_000_000 }), 1)],
      writes: [{ count: 1, error: null }],
    });

    await applyDraftMutation("draft-1", (d) => d);

    expect(Object.keys(admin.updates[0].payload).sort()).toEqual(["state", "version"]);
  });

  it("writes status, started_at and completed_at when requested", async () => {
    const startedAt = Date.parse("2026-07-21T10:00:00.000Z");
    const completedAt = Date.parse("2026-07-21T11:30:00.000Z");
    const admin = install({
      reads: [ok(makeDraft(), 1)],
      writes: [{ count: 1, error: null }],
    });

    await applyDraftMutation(
      "draft-1",
      (draft) => ({ ...draft, status: "complete", startedAt, completedAt }),
      { updateStatus: true, updateStartedAt: true, updateCompletedAt: true }
    );

    const payload = admin.updates[0].payload;
    expect(payload.status).toBe("complete");
    expect(payload.started_at).toBe("2026-07-21T10:00:00.000Z");
    expect(payload.completed_at).toBe("2026-07-21T11:30:00.000Z");
  });

  it("clears completed_at only when the mutated draft has none", async () => {
    const admin = install({
      reads: [ok(makeDraft({ completedAt: 123 }), 1)],
      writes: [{ count: 1, error: null }],
    });

    await applyDraftMutation("draft-1", (draft) => ({ ...draft, completedAt: null }), {
      clearCompletedAt: true,
    });

    expect(admin.updates[0].payload.completed_at).toBeNull();
  });

  it("leaves completed_at alone when clearCompletedAt is set but a timestamp remains", async () => {
    const admin = install({
      reads: [ok(makeDraft({ completedAt: 123 }), 1)],
      writes: [{ count: 1, error: null }],
    });

    await applyDraftMutation("draft-1", (d) => d, { clearCompletedAt: true });

    expect("completed_at" in admin.updates[0].payload).toBe(false);
  });
});

describe("applyDraftMutation — version conflict retry", () => {
  it("re-reads and re-applies the mutation when the guarded update matches no rows", async () => {
    const admin = install({
      reads: [ok(makeDraft({ currentPack: 1 }), 5), ok(makeDraft({ currentPack: 2 }), 6)],
      writes: [
        { count: 0, error: null }, // lost the race
        { count: 1, error: null }, // won on retry
      ],
    });

    const mutate = vi.fn<Mutator>((draft) => ({ ...draft, currentPack: draft.currentPack + 1 }));
    const result = await applyDraftMutation("draft-1", mutate);

    expect(result.success).toBe(true);
    // The retry re-reads, so the mutation is applied to the *winner's* state,
    // not the stale copy we first fetched.
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate.mock.calls[1][0].currentPack).toBe(2);
    expect(result.draft?.currentPack).toBe(3);

    expect(admin.readCount).toBe(2);
    expect(admin.updates).toHaveLength(2);
    expect(admin.updates[0].filters).toContainEqual(["version", 5]);
    expect(admin.updates[1].filters).toContainEqual(["version", 6]);
    expect(admin.updates[1].payload.version).toBe(7);
  });

  // With count: "exact" a null count shouldn't happen; this pins the fallback
  // so an unexpected null surfaces as a success rather than three blind retries.
  it("treats a null count as a successful write rather than a conflict", async () => {
    const admin = install({
      reads: [ok(makeDraft(), 1)],
      writes: [{ count: null, error: null }],
    });

    const result = await applyDraftMutation("draft-1", (d) => d);

    expect(result.success).toBe(true);
    expect(admin.updates).toHaveLength(1);
  });
});

describe("applyDraftMutation — retry exhaustion", () => {
  it("gives up after MAX_MUTATION_ATTEMPTS conflicting writes", async () => {
    const admin = install({
      reads: [ok(makeDraft(), 1)],
      writes: [{ count: 0, error: null }],
    });

    const mutate = vi.fn<Mutator>((draft) => draft);
    const result = await applyDraftMutation("draft-1", mutate);

    expect(result.success).toBe(false);
    expect(result.error).toBe(`Version conflict after ${MAX_MUTATION_ATTEMPTS} retries`);
    expect(result.draft).toBeUndefined();
    expect(mutate).toHaveBeenCalledTimes(MAX_MUTATION_ATTEMPTS);
    expect(admin.readCount).toBe(MAX_MUTATION_ATTEMPTS);
    expect(admin.updates).toHaveLength(MAX_MUTATION_ATTEMPTS);
  });

  it("still succeeds if the final attempt wins", async () => {
    const admin = install({
      reads: [ok(makeDraft(), 1)],
      writes: [
        { count: 0, error: null },
        { count: 0, error: null },
        { count: 1, error: null },
      ],
    });

    const result = await applyDraftMutation("draft-1", (d) => d);

    expect(result.success).toBe(true);
    expect(admin.updates).toHaveLength(3);
  });
});

describe("applyDraftMutation — failure modes", () => {
  it("returns the read error without attempting a write", async () => {
    const admin = install({
      reads: [{ data: null, error: { message: "connection reset" } }],
    });

    const result = await applyDraftMutation("draft-1", (d) => d);

    expect(result).toEqual({ success: false, error: "connection reset" });
    expect(admin.updates).toHaveLength(0);
  });

  it("returns 'Draft not found' when the row is missing", async () => {
    install({ reads: [{ data: null, error: null }] });

    const result = await applyDraftMutation("nope", (d) => d);

    expect(result).toEqual({ success: false, error: "Draft not found" });
  });

  it("returns 'Draft has no state' when the state column is null", async () => {
    const admin = install({
      reads: [{ data: { state: null, config: {}, version: 1, status: "lobby" }, error: null }],
    });

    const result = await applyDraftMutation("draft-1", (d) => d);

    expect(result).toEqual({ success: false, error: "Draft has no state" });
    expect(admin.updates).toHaveLength(0);
  });

  it("surfaces a thrown mutation error and does not write", async () => {
    const admin = install({ reads: [ok(makeDraft(), 1)] });

    const result = await applyDraftMutation("draft-1", () => {
      throw new Error("Not your turn to pick");
    });

    expect(result).toEqual({ success: false, error: "Not your turn to pick" });
    expect(admin.updates).toHaveLength(0);
  });

  it("falls back to a generic message when the mutation throws a non-Error", async () => {
    install({ reads: [ok(makeDraft(), 1)] });

    const result = await applyDraftMutation("draft-1", () => {
      throw "boom";
    });

    expect(result).toEqual({ success: false, error: "Mutation failed" });
  });

  it("returns the write error instead of retrying", async () => {
    const admin = install({
      reads: [ok(makeDraft(), 1)],
      writes: [{ count: 0, error: { message: "permission denied" } }],
    });

    const result = await applyDraftMutation("draft-1", (d) => d);

    expect(result).toEqual({ success: false, error: "permission denied" });
    expect(admin.updates).toHaveLength(1);
  });
});
