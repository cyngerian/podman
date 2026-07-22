/**
 * Test harness for the RLS integration suite.
 *
 * These tests run against a **real** local Supabase (`npx supabase start`) —
 * never a mock. RLS is the thing under test, and a hand-rolled PostgREST
 * double cannot tell you whether a policy recurses, whether `anon` still has
 * EXECUTE on a SECURITY DEFINER helper, or whether a `WITH CHECK` clause fires.
 *
 * Connection details come from `npx supabase status -o env` (see
 * `globalSetup.ts`), so there is nothing to configure locally or in CI.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ensureSupabaseEnv } from "./env";

export type Client = SupabaseClient;

function requireEnv(name: string): string {
  ensureSupabaseEnv();
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Run \`npx supabase start\`, then \`npm run test:rls\` ` +
        `(the global setup reads connection details from \`supabase status\`).`
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return requireEnv("SUPABASE_TEST_URL");
}

/** Service-role client. Bypasses RLS — use for fixtures and teardown only. */
export function adminClient(): Client {
  return createClient(supabaseUrl(), requireEnv("SUPABASE_TEST_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Unauthenticated client — exercises the `anon` role. */
export function anonClient(): Client {
  return createClient(
    supabaseUrl(),
    requireEnv("SUPABASE_TEST_PUBLISHABLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/** The slice of `drafts.state` the E2E assertions read back. */
export interface DraftStateShape {
  seats: {
    userId: string;
    pool: unknown[];
    deck: unknown[] | null;
    hasSubmittedDeck?: boolean;
  }[];
}

export interface TestUser {
  id: string;
  email: string;
  /** Client authenticated as this user — exercises the `authenticated` role. */
  client: Client;
}

const PASSWORD = "rls-integration-test-password";

/**
 * Tracks everything a test file created so `cleanup()` can unwind it in
 * FK-safe order. Deleting an auth user cascades to `profiles`, but rows that
 * reference `profiles` without `ON DELETE CASCADE` (drafts.host_id,
 * groups.created_by) have to go first.
 */
export class Fixtures {
  /** Password every fixture user is created with. */
  readonly password = PASSWORD;

  private readonly admin = adminClient();
  private readonly userIds: string[] = [];
  private readonly groupIds: string[] = [];
  private readonly draftIds: string[] = [];

  /** Creates a confirmed auth user and returns a client signed in as them. */
  async createUser(label: string): Promise<TestUser> {
    const email = `rls-${label}-${crypto.randomUUID()}@example.test`;
    const { data, error } = await this.admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: `Test ${label}` },
    });
    if (error || !data.user) {
      throw new Error(`Failed to create test user: ${error?.message}`);
    }
    this.userIds.push(data.user.id);

    const client = anonClient();
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    if (signInError) {
      throw new Error(`Failed to sign in test user: ${signInError.message}`);
    }

    return { id: data.user.id, email, client };
  }

  /** Creates a group with `owner` as its admin member. */
  async createGroup(
    owner: TestUser,
    name = `RLS Test Group ${crypto.randomUUID().slice(0, 8)}`
  ): Promise<string> {
    const { data, error } = await this.admin
      .from("groups")
      .insert({ name, created_by: owner.id })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Failed to create group: ${error?.message}`);
    this.groupIds.push(data.id);

    await this.addMember(data.id, owner, "admin");
    return data.id;
  }

  async addMember(
    groupId: string,
    user: TestUser,
    role: "admin" | "member" = "member"
  ): Promise<void> {
    const { error } = await this.admin
      .from("group_members")
      .insert({ group_id: groupId, user_id: user.id, role });
    if (error) throw new Error(`Failed to add member: ${error.message}`);
  }

  /** Creates a draft row. `players` get `draft_players` rows (RLS read access). */
  async createDraft(opts: {
    host: TestUser;
    groupId: string | null;
    players?: TestUser[];
    isSimulated?: boolean;
    status?: string;
    state?: unknown;
  }): Promise<string> {
    const { data, error } = await this.admin
      .from("drafts")
      .insert({
        host_id: opts.host.id,
        group_id: opts.groupId,
        format: "standard",
        status: opts.status ?? "active",
        is_simulated: opts.isSimulated ?? false,
        config: {},
        state: opts.state ?? null,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Failed to create draft: ${error?.message}`);
    this.draftIds.push(data.id);

    for (const [i, player] of (opts.players ?? []).entries()) {
      const { error: playerError } = await this.admin
        .from("draft_players")
        .insert({ draft_id: data.id, user_id: player.id, seat_position: i });
      if (playerError) {
        throw new Error(`Failed to add draft player: ${playerError.message}`);
      }
    }

    return data.id;
  }

  async createGroupInvite(groupId: string, creator: TestUser): Promise<string> {
    const { data, error } = await this.admin
      .from("group_invites")
      .insert({ group_id: groupId, created_by: creator.id })
      .select("token")
      .single();
    if (error || !data) throw new Error(`Failed to create invite: ${error?.message}`);
    return data.token;
  }

  async createProposal(groupId: string, proposer: TestUser): Promise<string> {
    const { data, error } = await this.admin
      .from("draft_proposals")
      .insert({
        group_id: groupId,
        proposed_by: proposer.id,
        title: "RLS test proposal",
        format: "standard",
        player_count: 8,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Failed to create proposal: ${error?.message}`);
    return data.id;
  }

  /** Reads a draft's engine state with RLS bypassed (assertions, not fixtures). */
  async readDraftState<T = DraftStateShape>(draftId: string): Promise<T> {
    const { data, error } = await this.admin
      .from("drafts")
      .select("state")
      .eq("id", draftId)
      .single();
    if (error || !data) throw new Error(`Failed to read draft: ${error?.message}`);
    return data.state as T;
  }

  /** Drops everything this fixture set created, newest dependency first. */
  async cleanup(): Promise<void> {
    // Drafts the *app* created on a fixture user's behalf (the E2E run) are not
    // in `draftIds`, and `drafts.host_id` has no ON DELETE CASCADE — so they
    // have to go before the users, or `deleteUser` leaves orphaned rows behind.
    if (this.userIds.length > 0) {
      await this.admin.from("drafts").delete().in("host_id", this.userIds);
    }
    for (const id of this.draftIds) {
      await this.admin.from("drafts").delete().eq("id", id);
    }
    for (const id of this.groupIds) {
      await this.admin.from("groups").delete().eq("id", id);
    }
    for (const id of this.userIds) {
      await this.admin.auth.admin.deleteUser(id);
    }
    this.draftIds.length = 0;
    this.groupIds.length = 0;
    this.userIds.length = 0;
  }
}
