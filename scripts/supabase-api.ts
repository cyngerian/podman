/**
 * Shared Supabase Management API utilities for scripts.
 *
 * Provides executeSql (with retry), env var helpers, SQL escaping,
 * and table ordering constants for backup/restore/sync scripts.
 */

// --- Env Helpers ---

export function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return val;
}

// --- SQL Helpers ---

export function esc(s: string): string {
  return s.replace(/'/g, "''");
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Execute raw SQL via Supabase Management API.
 * POST /v1/projects/{ref}/database/query
 * Retries on 429 (rate limit) with exponential backoff.
 */
export async function executeSql(
  projectRef: string,
  accessToken: string,
  sql: string
): Promise<unknown> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const resp = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    if (resp.status === 429) {
      const wait = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s, 16s, 32s
      await sleep(wait);
      continue;
    }

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`SQL failed (${resp.status}): ${text.slice(0, 500)}`);
    }

    return resp.json();
  }

  throw new Error("Rate limited after 5 retries");
}

// --- Table Ordering ---

/**
 * Columns to exclude when inserting into auth tables.
 * auth.identities.email is a generated column and cannot be inserted.
 */
export const AUTH_GENERATED_COLUMNS: Record<string, Set<string>> = {
  users: new Set(["confirmed_at"]),
  identities: new Set(["email", "confirmed_at"]),
};

/**
 * GoTrue expects certain varchar columns in auth.users to be empty strings,
 * not NULL. Production may store NULLs, but GoTrue crashes with
 * "Database error querying schema" when scanning NULL into Go string fields.
 * Run this after inserting auth.users rows.
 */
export const AUTH_USERS_COALESCE_SQL = `
UPDATE auth.users SET
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '')
WHERE email_change IS NULL
   OR email_change_token_new IS NULL
   OR email_change_token_current IS NULL
   OR phone_change IS NULL
   OR phone_change_token IS NULL
   OR confirmation_token IS NULL
   OR recovery_token IS NULL
   OR reauthentication_token IS NULL`;

/**
 * User/game data tables in FK-safe insert order (parents first).
 * Does NOT include booster data tables (those use load-booster-data.ts).
 *
 * auth.users and auth.identities are handled separately since they're in
 * the auth schema. profiles is also special: the handle_new_user trigger
 * auto-creates rows on auth.users insert, so we update profiles rather
 * than insert.
 */
export const DATA_TABLES = [
  "profiles",
  "groups",
  "group_members",
  "group_invites",
  "draft_proposals",
  "proposal_votes",
  "drafts",
  "draft_players",
] as const;

/** Reverse FK order for deletes (children first). */
export const DATA_TABLES_DELETE = [...DATA_TABLES].reverse();
