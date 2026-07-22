import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSupabaseMock,
  expectRedirect,
  redirect,
  revalidatePath,
  type Responder,
  type SupabaseCall,
  type SupabaseResult,
} from "@/lib/__tests__/supabase-mock";

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));

// Both clients are swapped per-test via the setup helpers below.
let serverClient: unknown = null;
let adminClient: unknown = null;
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => serverClient,
}));
vi.mock("@/lib/supabase-admin", () => ({
  createAdminClient: () => adminClient,
}));

const { createGroup, leaveGroup } = await import("../actions");
const { voteOnProposal, createProposal } = await import("../[groupId]/actions");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup(responder: Responder, user: { id: string } | null = { id: "user-1" }) {
  const server = createSupabaseMock(responder, user);
  const admin = createSupabaseMock(responder, user);
  serverClient = server.client;
  adminClient = admin.client;
  return { server, admin };
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** Builds a responder from a `table:op` lookup, defaulting to an empty result. */
function respond(routes: Record<string, SupabaseResult | ((c: SupabaseCall) => SupabaseResult)>) {
  return (call: SupabaseCall): SupabaseResult => {
    const route = routes[`${call.table}:${call.op}`];
    if (typeof route === "function") return route(call);
    return route ?? { data: null, error: null, count: null };
  };
}

const MEMBER = { data: { role: "member" }, error: null };
const NOT_A_MEMBER = { data: null, error: { message: "no rows" } };

beforeEach(() => {
  redirect.mockClear();
  revalidatePath.mockClear();
  serverClient = null;
  adminClient = null;
});

// ---------------------------------------------------------------------------
// createGroup
// ---------------------------------------------------------------------------

describe("createGroup — auth guard", () => {
  it("redirects an unauthenticated caller to login without writing anything", async () => {
    const { server } = setup(respond({}), null);

    await expectRedirect(() => createGroup(form({ name: "Pod Squad" })), "/auth/login");

    expect(server.of("insert")).toHaveLength(0);
  });

  it("rejects a blank name before touching Supabase", async () => {
    const { server } = setup(respond({}), null);

    await expect(createGroup(form({ name: "   " }))).resolves.toEqual({
      error: "Group name is required",
    });
    expect(server.calls).toHaveLength(0);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("creates the group and adds the creator as an admin member", async () => {
    const { server } = setup(
      respond({
        "groups:insert": { data: { id: "group-9" }, error: null },
      })
    );

    await expectRedirect(
      () => createGroup(form({ name: "Pod Squad", emoji: "🐸", description: "weekly" })),
      "/dashboard/groups/group-9"
    );

    expect(server.of("insert", "groups")[0].payload).toEqual({
      name: "Pod Squad",
      emoji: "🐸",
      description: "weekly",
      created_by: "user-1",
    });
    expect(server.of("insert", "group_members")[0].payload).toEqual({
      group_id: "group-9",
      user_id: "user-1",
      role: "admin",
    });
  });

  it("returns the insert error and never adds a membership row", async () => {
    const { server } = setup(
      respond({ "groups:insert": { data: null, error: { message: "duplicate name" } } })
    );

    await expect(createGroup(form({ name: "Pod Squad" }))).resolves.toEqual({
      error: "duplicate name",
    });
    expect(server.of("insert", "group_members")).toHaveLength(0);
  });

  it("surfaces a membership-insert failure instead of redirecting into an orphan group", async () => {
    // `group_members_insert` (20260721000200) only permits the creator's own
    // admin row. If that check ever stops matching, the group would exist with
    // no members — reachable by nobody, including its creator.
    const { server } = setup(
      respond({
        "groups:insert": { data: { id: "group-9" }, error: null },
        "group_members:insert": { data: null, error: { message: "denied" } },
      })
    );

    await expect(createGroup(form({ name: "Pod Squad" }))).resolves.toEqual({
      error: "denied",
    });
    expect(server.of("insert", "groups")).toHaveLength(1);
    expect(redirect).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// leaveGroup
// ---------------------------------------------------------------------------

describe("leaveGroup — auth guard", () => {
  it("redirects an unauthenticated caller to login without deleting anything", async () => {
    const { server } = setup(respond({}), null);

    await expectRedirect(() => leaveGroup(form({ group_id: "group-1" })), "/auth/login");

    expect(server.of("delete")).toHaveLength(0);
  });

  it("deletes only the caller's own membership row", async () => {
    const { server } = setup(respond({}), { id: "user-1" });

    await expectRedirect(() => leaveGroup(form({ group_id: "group-1" })), "/dashboard");

    const del = server.of("delete", "group_members");
    expect(del).toHaveLength(1);
    // The user_id filter is what stops a caller from evicting someone else.
    expect(del[0].filters).toEqual([
      ["group_id", "group-1"],
      ["user_id", "user-1"],
    ]);
  });
});

// ---------------------------------------------------------------------------
// createProposal
// ---------------------------------------------------------------------------

describe("createProposal — membership guard", () => {
  const fields = {
    group_id: "group-1",
    title: "Friday draft",
    format: "standard",
    player_count: "8",
  };

  it("redirects an unauthenticated caller to login", async () => {
    const { server } = setup(respond({}), null);

    await expectRedirect(() => createProposal(form(fields)), "/auth/login");

    expect(server.of("insert")).toHaveLength(0);
  });

  it("refuses a non-member without inserting a proposal", async () => {
    const { server } = setup(respond({ "group_members:select": NOT_A_MEMBER }));

    await expect(createProposal(form(fields))).resolves.toEqual({
      error: "Not a member of this group",
    });
    expect(server.of("insert")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// voteOnProposal
// ---------------------------------------------------------------------------

describe("voteOnProposal — auth and membership guards", () => {
  const fields = { proposal_id: "prop-1", group_id: "group-1", vote: "in" };

  it("redirects an unauthenticated caller to login without recording a vote", async () => {
    const { server } = setup(respond({}), null);

    await expectRedirect(() => voteOnProposal(form(fields)), "/auth/login");

    expect(server.of("upsert")).toHaveLength(0);
  });

  it("redirects a non-member to the dashboard without recording a vote", async () => {
    const { server } = setup(respond({ "group_members:select": NOT_A_MEMBER }));

    await expectRedirect(() => voteOnProposal(form(fields)), "/dashboard");

    expect(server.of("upsert")).toHaveLength(0);
  });

  it("checks membership against the caller's own user id", async () => {
    const { server } = setup(
      respond({
        "group_members:select": MEMBER,
        "draft_proposals:select": { data: { player_count: 8, status: "open" }, error: null },
        "proposal_votes:select": { count: 1, error: null },
      }),
      { id: "user-7" }
    );

    await expectRedirect(
      () => voteOnProposal(form(fields)),
      "/dashboard/groups/group-1/proposals/prop-1"
    );

    expect(server.of("select", "group_members")[0].filters).toEqual([
      ["group_id", "group-1"],
      ["user_id", "user-7"],
    ]);
  });

  it("upserts the member's vote keyed to their own user id", async () => {
    const { server } = setup(
      respond({
        "group_members:select": MEMBER,
        "draft_proposals:select": { data: { player_count: 8, status: "open" }, error: null },
        "proposal_votes:select": { count: 3, error: null },
      })
    );

    await expectRedirect(
      () => voteOnProposal(form({ ...fields, vote: "out" })),
      "/dashboard/groups/group-1/proposals/prop-1"
    );

    expect(server.of("upsert", "proposal_votes")[0].payload).toEqual({
      proposal_id: "prop-1",
      user_id: "user-1",
      vote: "out",
    });
  });
});

describe("voteOnProposal — auto-confirm TOCTOU guard", () => {
  const fields = { proposal_id: "prop-1", group_id: "group-1", vote: "in" };

  function autoConfirmSetup(opts: { status: string; inVotes: number; playerCount: number }) {
    return setup(
      respond({
        "group_members:select": MEMBER,
        "draft_proposals:select": {
          data: { player_count: opts.playerCount, status: opts.status },
          error: null,
        },
        "proposal_votes:select": { count: opts.inVotes, error: null },
      })
    );
  }

  it("confirms with an update guarded by status='open' once the vote count is met", async () => {
    const { admin } = autoConfirmSetup({ status: "open", inVotes: 8, playerCount: 8 });

    await expectRedirect(
      () => voteOnProposal(form(fields)),
      "/dashboard/groups/group-1/proposals/prop-1"
    );

    const updates = admin.of("update", "draft_proposals");
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toEqual({ status: "confirmed" });
    // The status='open' filter is the race guard: a concurrent voter that also
    // saw count >= player_count matches zero rows and cannot re-confirm.
    expect(updates[0].filters).toEqual([
      ["id", "prop-1"],
      ["status", "open"],
    ]);
  });

  it("uses the admin client for the confirm, not the RLS-scoped server client", async () => {
    const { server, admin } = autoConfirmSetup({ status: "open", inVotes: 8, playerCount: 8 });

    await expectRedirect(
      () => voteOnProposal(form(fields)),
      "/dashboard/groups/group-1/proposals/prop-1"
    );

    expect(admin.of("update", "draft_proposals")).toHaveLength(1);
    expect(server.of("update", "draft_proposals")).toHaveLength(0);
  });

  it("does not confirm when the proposal already left the open state", async () => {
    const { admin } = autoConfirmSetup({ status: "confirmed", inVotes: 8, playerCount: 8 });

    await expectRedirect(
      () => voteOnProposal(form(fields)),
      "/dashboard/groups/group-1/proposals/prop-1"
    );

    expect(admin.of("update", "draft_proposals")).toHaveLength(0);
  });

  it("does not confirm while 'in' votes are short of the player count", async () => {
    const { admin } = autoConfirmSetup({ status: "open", inVotes: 7, playerCount: 8 });

    await expectRedirect(
      () => voteOnProposal(form(fields)),
      "/dashboard/groups/group-1/proposals/prop-1"
    );

    expect(admin.of("update", "draft_proposals")).toHaveLength(0);
  });

  it("counts only 'in' votes for this proposal", async () => {
    const { server } = autoConfirmSetup({ status: "open", inVotes: 8, playerCount: 8 });

    await expectRedirect(
      () => voteOnProposal(form(fields)),
      "/dashboard/groups/group-1/proposals/prop-1"
    );

    const countQuery = server.of("select", "proposal_votes")[0];
    expect(countQuery.head).toBe(true);
    expect(countQuery.filters).toEqual([
      ["proposal_id", "prop-1"],
      ["vote", "in"],
    ]);
  });

  it("confirms when the count overshoots the player count", async () => {
    const { admin } = autoConfirmSetup({ status: "open", inVotes: 9, playerCount: 8 });

    await expectRedirect(
      () => voteOnProposal(form(fields)),
      "/dashboard/groups/group-1/proposals/prop-1"
    );

    expect(admin.of("update", "draft_proposals")).toHaveLength(1);
  });
});
