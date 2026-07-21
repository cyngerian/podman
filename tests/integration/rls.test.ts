/**
 * RLS regression suite — runs against a real local Supabase.
 *
 * Guards two classes of regression that unit tests structurally cannot catch:
 *
 * 1. **Policy recursion.** `20260213000300_fix_rls_infinite_recursion.sql`
 *    replaced self-referencing `group_members` / `draft_players` policies with
 *    SECURITY DEFINER helpers. A naive rewrite brings back error 42P17, which
 *    shows up as a *query error*, not as wrong rows — so every read-path test
 *    below asserts `error` is null in addition to checking visibility.
 *
 * 2. **Function privileges.** `20260717000000_harden_function_privileges.sql`
 *    revoked EXECUTE from `anon` on the RLS helpers and trigger functions
 *    while keeping it for `authenticated` (policies evaluate helpers as the
 *    querying role — revoking from `authenticated` breaks every policy). Both
 *    directions are asserted here.
 *
 * Conventions: RLS denials on SELECT surface as **zero rows**, not an error.
 * Denials on INSERT/UPDATE surface as an error (42501) for INSERT, and as
 * **zero affected rows** for UPDATE/DELETE (the row is invisible to the
 * writer, so there is nothing to update).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Fixtures, anonClient, type TestUser, type Client } from "./helpers/supabase";

const fixtures = new Fixtures();

/** Group admin: creates the group, its invites, and hosts the group draft. */
let admin: TestUser;
/** Plain member of the group, seated in the group draft. */
let member: TestUser;
/** Authenticated user with no relationship to any fixture. */
let outsider: TestUser;
let anon: Client;

let groupId: string;
let groupDraftId: string;
let simulatedDraftId: string;
let inviteToken: string;
let proposalId: string;

/**
 * Minimal `drafts.state` shaped like the draft engine's output — just enough
 * for `get_draft_pick_view` to find a seat and build the pod list.
 */
function draftState(seatUserId: string, seatDisplayName: string) {
  const card = {
    scryfallId: "card-1",
    name: "Test Card",
    imageUri: "",
    smallImageUri: "",
    rarity: "common",
    colors: [],
    cmc: 1,
    isFoil: false,
  };
  return {
    setCode: "TST",
    setName: "Test Set",
    startedAt: 1_700_000_000_000,
    currentPack: 1,
    cardsPerPack: 2,
    timerPreset: "none",
    pacingMode: "realtime",
    seats: [
      {
        position: 0,
        userId: seatUserId,
        displayName: seatDisplayName,
        currentPack: { round: 1, pickNumber: 0, cards: [card] },
        pool: [card],
        deck: [card],
        sideboard: [],
        picks: [card],
        packQueue: [],
        packReceivedAt: 1_700_000_000_000,
      },
      {
        position: 1,
        userId: "bot-1",
        displayName: "Bot 1",
        currentPack: { round: 1, pickNumber: 0, cards: [card] },
        pool: [],
        deck: null,
        sideboard: null,
        picks: [],
        packQueue: [],
        packReceivedAt: 1_700_000_000_000,
      },
    ],
  };
}

beforeAll(async () => {
  anon = anonClient();

  [admin, member, outsider] = await Promise.all([
    fixtures.createUser("admin"),
    fixtures.createUser("member"),
    fixtures.createUser("outsider"),
  ]);

  groupId = await fixtures.createGroup(admin);
  await fixtures.addMember(groupId, member, "member");

  groupDraftId = await fixtures.createDraft({
    host: admin,
    groupId,
    players: [admin, member],
  });

  simulatedDraftId = await fixtures.createDraft({
    host: member,
    groupId: null,
    players: [member],
    isSimulated: true,
    state: draftState(member.id, "Test member"),
  });

  inviteToken = await fixtures.createGroupInvite(groupId, admin);
  proposalId = await fixtures.createProposal(groupId, admin);
}, 60_000);

afterAll(async () => {
  await fixtures.cleanup();
});

// ---------------------------------------------------------------------------
// groups
// ---------------------------------------------------------------------------

describe("groups", () => {
  it("lets a member read the group", async () => {
    const { data, error } = await member.client
      .from("groups")
      .select("id, name")
      .eq("id", groupId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("hides the group from a non-member", async () => {
    const { data, error } = await outsider.client
      .from("groups")
      .select("id")
      .eq("id", groupId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("hides the group from anon", async () => {
    const { data, error } = await anon.from("groups").select("id").eq("id", groupId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("rejects an insert that claims another user as creator", async () => {
    const { error } = await outsider.client
      .from("groups")
      .insert({ name: "Spoofed", created_by: admin.id });

    expect(error).not.toBeNull();
  });

  it("does not let a plain member rename the group", async () => {
    const { data, error } = await member.client
      .from("groups")
      .update({ name: "Renamed by member" })
      .eq("id", groupId)
      .select("id");

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("lets a group admin rename the group", async () => {
    const { data, error } = await admin.client
      .from("groups")
      .update({ name: "Renamed by admin" })
      .eq("id", groupId)
      .select("id");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// group_members — the table whose policies caused the 42P17 recursion
// ---------------------------------------------------------------------------

describe("group_members", () => {
  it("lets a member read the full roster without recursing", async () => {
    const { data, error } = await member.client
      .from("group_members")
      .select("user_id, role")
      .eq("group_id", groupId);

    // A recursion regression surfaces here as error 42P17, not as wrong rows.
    expect(error).toBeNull();
    expect(data?.map((r) => r.user_id).sort()).toEqual([admin.id, member.id].sort());
  });

  it("hides the roster from a non-member", async () => {
    const { data, error } = await outsider.client
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("hides the roster from anon", async () => {
    const { data, error } = await anon
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("does not let a plain member add someone else to the group", async () => {
    const { error } = await member.client
      .from("group_members")
      .insert({ group_id: groupId, user_id: outsider.id, role: "member" });

    expect(error).not.toBeNull();
  });

  it("lets a group admin add a member", async () => {
    const { error } = await admin.client
      .from("group_members")
      .insert({ group_id: groupId, user_id: outsider.id, role: "member" });

    expect(error).toBeNull();

    // Undo — the rest of the suite relies on `outsider` being an outsider.
    await admin.client
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", outsider.id);
  });

  it("lets a member leave, but not remove someone else", async () => {
    const { data: removeOther, error: removeOtherError } = await member.client
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", admin.id)
      .select("user_id");

    expect(removeOtherError).toBeNull();
    expect(removeOther).toEqual([]);

    const { data: leave, error: leaveError } = await member.client
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", member.id)
      .select("user_id");

    expect(leaveError).toBeNull();
    expect(leave).toHaveLength(1);

    await fixtures.addMember(groupId, member, "member");
  });

  it(
    "KNOWN GAP: lets any authenticated user add themselves to any group they " +
      "know the id of (group_members_insert allows `user_id = auth.uid()`)",
    async () => {
      // Documented, not endorsed — see docs/testing.md § Known RLS gaps.
      // If this starts failing, the policy was tightened: delete this test and
      // the docs entry rather than loosening the policy back.
      const { error } = await outsider.client
        .from("group_members")
        .insert({ group_id: groupId, user_id: outsider.id, role: "member" });

      expect(error).toBeNull();

      await outsider.client
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", outsider.id);
    }
  );
});

// ---------------------------------------------------------------------------
// draft_proposals
// ---------------------------------------------------------------------------

describe("draft_proposals", () => {
  it("lets a group member read proposals", async () => {
    const { data, error } = await member.client
      .from("draft_proposals")
      .select("id")
      .eq("id", proposalId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("hides proposals from a non-member", async () => {
    const { data, error } = await outsider.client
      .from("draft_proposals")
      .select("id")
      .eq("id", proposalId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("does not let a non-member propose a draft in the group", async () => {
    const { error } = await outsider.client.from("draft_proposals").insert({
      group_id: groupId,
      proposed_by: outsider.id,
      title: "Intruder proposal",
      format: "standard",
      player_count: 8,
    });

    expect(error).not.toBeNull();
  });

  it("lets a member propose a draft in their own group", async () => {
    const { data, error } = await member.client
      .from("draft_proposals")
      .insert({
        group_id: groupId,
        proposed_by: member.id,
        title: "Member proposal",
        format: "standard",
        player_count: 8,
      })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// drafts + draft_players
// ---------------------------------------------------------------------------

describe("drafts", () => {
  it("lets a seated player read the draft", async () => {
    const { data, error } = await member.client
      .from("drafts")
      .select("id, status")
      .eq("id", groupDraftId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("hides the draft from a user who is not in it", async () => {
    const { data, error } = await outsider.client
      .from("drafts")
      .select("id")
      .eq("id", groupDraftId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("hides the draft from anon", async () => {
    const { data, error } = await anon.from("drafts").select("id").eq("id", groupDraftId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("lets the host read their own simulated draft", async () => {
    const { data, error } = await member.client
      .from("drafts")
      .select("id, is_simulated")
      .eq("id", simulatedDraftId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("hides a simulated draft from everyone but its host", async () => {
    const { data, error } = await outsider.client
      .from("drafts")
      .select("id")
      .eq("id", simulatedDraftId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("does not let a non-host player mutate the draft", async () => {
    const { data, error } = await member.client
      .from("drafts")
      .update({ status: "complete" })
      .eq("id", groupDraftId)
      .select("id");

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe("draft_players", () => {
  it("lets a seated player read the roster without recursing", async () => {
    const { data, error } = await member.client
      .from("draft_players")
      .select("user_id")
      .eq("draft_id", groupDraftId);

    expect(error).toBeNull();
    expect(data?.map((r) => r.user_id).sort()).toEqual([admin.id, member.id].sort());
  });

  it("hides the roster from a user who is not in the draft", async () => {
    const { data, error } = await outsider.client
      .from("draft_players")
      .select("user_id")
      .eq("draft_id", groupDraftId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("does not let a non-host seat another user", async () => {
    const { error } = await member.client
      .from("draft_players")
      .insert({ draft_id: groupDraftId, user_id: outsider.id, seat_position: 5 });

    expect(error).not.toBeNull();
  });

  it("lets the host seat another user", async () => {
    const { error } = await admin.client
      .from("draft_players")
      .insert({ draft_id: groupDraftId, user_id: outsider.id, seat_position: 5 });

    expect(error).toBeNull();

    await admin.client
      .from("draft_players")
      .delete()
      .eq("draft_id", groupDraftId)
      .eq("user_id", outsider.id);
  });
});

// ---------------------------------------------------------------------------
// group_invites
// ---------------------------------------------------------------------------

describe("group_invites", () => {
  it("lets a group admin read invites", async () => {
    const { data, error } = await admin.client
      .from("group_invites")
      .select("token")
      .eq("group_id", groupId);

    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
  });

  it("hides invites from a plain member", async () => {
    const { data, error } = await member.client
      .from("group_invites")
      .select("token")
      .eq("group_id", groupId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("hides invites from anon", async () => {
    const { data, error } = await anon
      .from("group_invites")
      .select("token")
      .eq("group_id", groupId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("does not let a plain member mint an invite", async () => {
    const { error } = await member.client
      .from("group_invites")
      .insert({ group_id: groupId, created_by: member.id });

    expect(error).not.toBeNull();
  });

  it("does not let a group admin mint an invite attributed to someone else", async () => {
    const { error } = await admin.client
      .from("group_invites")
      .insert({ group_id: groupId, created_by: member.id });

    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// profiles
// ---------------------------------------------------------------------------

describe("profiles", () => {
  it("lets any authenticated user read profiles", async () => {
    const { data, error } = await outsider.client
      .from("profiles")
      .select("id, display_name")
      .eq("id", admin.id);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("hides profiles from anon", async () => {
    const { data, error } = await anon.from("profiles").select("id").eq("id", admin.id);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("does not let a user edit someone else's profile", async () => {
    const { data, error } = await outsider.client
      .from("profiles")
      .update({ display_name: "Hijacked" })
      .eq("id", admin.id)
      .select("id");

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("lets a user edit their own profile", async () => {
    const { data, error } = await outsider.client
      .from("profiles")
      .update({ display_name: "Renamed self" })
      .eq("id", outsider.id)
      .select("display_name");

    expect(error).toBeNull();
    expect(data).toEqual([{ display_name: "Renamed self" }]);
  });
});

// ---------------------------------------------------------------------------
// SECURITY DEFINER helpers — privilege surface
// ---------------------------------------------------------------------------

describe("SECURITY DEFINER helper privileges", () => {
  it("lets authenticated call user_group_ids and scopes it to the caller's argument", async () => {
    const { data, error } = await member.client.rpc("user_group_ids", {
      p_user_id: member.id,
    });

    expect(error).toBeNull();
    expect(data).toContain(groupId);
  });

  it("lets authenticated call user_draft_ids", async () => {
    const { data, error } = await member.client.rpc("user_draft_ids", {
      p_user_id: member.id,
    });

    expect(error).toBeNull();
    expect(data).toContain(groupDraftId);
  });

  it("lets authenticated call is_group_admin and distinguishes roles", async () => {
    const asAdmin = await member.client.rpc("is_group_admin", {
      p_group_id: groupId,
      p_user_id: admin.id,
    });
    const asMember = await member.client.rpc("is_group_admin", {
      p_group_id: groupId,
      p_user_id: member.id,
    });

    expect(asAdmin.error).toBeNull();
    expect(asAdmin.data).toBe(true);
    expect(asMember.error).toBeNull();
    expect(asMember.data).toBe(false);
  });

  it.each([
    ["user_group_ids", { p_user_id: "00000000-0000-0000-0000-000000000000" }],
    ["user_draft_ids", { p_user_id: "00000000-0000-0000-0000-000000000000" }],
    [
      "is_group_admin",
      {
        p_group_id: "00000000-0000-0000-0000-000000000000",
        p_user_id: "00000000-0000-0000-0000-000000000000",
      },
    ],
  ])("denies anon EXECUTE on %s", async (fn, args) => {
    const { error } = await anon.rpc(fn, args as Record<string, unknown>);
    expect(error).not.toBeNull();
  });

  it.each([["handle_new_user"], ["update_updated_at"]])(
    "denies both roles EXECUTE on the trigger function %s",
    async (fn) => {
      const asAnon = await anon.rpc(fn);
      const asUser = await member.client.rpc(fn);

      expect(asAnon.error).not.toBeNull();
      expect(asUser.error).not.toBeNull();
    }
  );

  it("denies every API role EXECUTE on draft_card_keys", async () => {
    const asAnon = await anon.rpc("draft_card_keys", { p_cards: [] });
    const asUser = await member.client.rpc("draft_card_keys", { p_cards: [] });

    expect(asAnon.error).not.toBeNull();
    expect(asUser.error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Invite RPCs
// ---------------------------------------------------------------------------

describe("invite RPCs", () => {
  it("lets anon read invite info (public invite landing page)", async () => {
    const { data, error } = await anon.rpc("get_invite_info", {
      p_token: inviteToken,
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0].group_name).toBeTruthy();
    expect(data?.[0].is_expired).toBe(false);
  });

  it("denies anon EXECUTE on accept_group_invite", async () => {
    const { error } = await anon.rpc("accept_group_invite", {
      p_token: inviteToken,
    });

    expect(error).not.toBeNull();
  });

  it("lets an authenticated outsider join via a valid invite token", async () => {
    const { data, error } = await outsider.client.rpc("accept_group_invite", {
      p_token: inviteToken,
    });

    expect(error).toBeNull();
    expect(data).toBe(groupId);

    // The join is what grants visibility — verify the policy follows through.
    const { data: rows } = await outsider.client
      .from("groups")
      .select("id")
      .eq("id", groupId);
    expect(rows).toHaveLength(1);

    await outsider.client
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", outsider.id);
  });

  it("rejects an unknown invite token", async () => {
    const { error } = await outsider.client.rpc("accept_group_invite", {
      p_token: "00000000-0000-0000-0000-000000000000",
    });

    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// get_draft_pick_view — SECURITY DEFINER, does its own authorization
// ---------------------------------------------------------------------------

describe("get_draft_pick_view", () => {
  it("returns the caller's own seat and the pod list", async () => {
    const { data, error } = await member.client.rpc("get_draft_pick_view", {
      p_draft_id: simulatedDraftId,
    });

    expect(error).toBeNull();
    const view = data as {
      status: string;
      seat: { position: number; pool: unknown[] } | null;
      podMembers: { userId: string }[];
    };
    expect(view.status).toBe("active");
    expect(view.seat?.position).toBe(0);
    expect(view.seat?.pool).toHaveLength(1);
    expect(view.podMembers).toHaveLength(2);
  });

  it("returns no seat and no roster to an authenticated non-participant", async () => {
    const { data, error } = await outsider.client.rpc("get_draft_pick_view", {
      p_draft_id: simulatedDraftId,
    });

    expect(error).toBeNull();
    const view = data as { status: string; seat: null; podMembers: unknown[] };
    expect(view.seat).toBeNull();
    expect(view.podMembers).toEqual([]);
  });

  it("denies anon EXECUTE", async () => {
    const { error } = await anon.rpc("get_draft_pick_view", {
      p_draft_id: simulatedDraftId,
    });

    expect(error).not.toBeNull();
  });
});
