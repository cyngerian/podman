/**
 * Direct Postgres access for the few things PostgREST cannot express.
 *
 * PostgREST hides functions the current role lacks EXECUTE on, and never
 * exposes trigger-returning functions at all — so "anon may not call this"
 * comes back as `PGRST202 not found in the schema cache` whether the grant was
 * revoked or the function was deleted. For grants on trigger functions, and for
 * the RLS-enabled sweep, the catalog is the only honest source.
 */
import { Client } from "pg";
import { ensureSupabaseEnv } from "./env";

export async function query<T extends Record<string, unknown>>(
  text: string,
  values: unknown[] = []
): Promise<T[]> {
  ensureSupabaseEnv();
  const client = new Client({ connectionString: process.env.SUPABASE_TEST_DB_URL });
  await client.connect();
  try {
    const result = await client.query(text, values);
    return result.rows as T[];
  } finally {
    await client.end();
  }
}

/** `has_function_privilege(role, fn, 'EXECUTE')` for a fully-qualified signature. */
export async function canExecute(role: string, signature: string): Promise<boolean> {
  const rows = await query<{ allowed: boolean }>(
    "select has_function_privilege($1, $2, 'EXECUTE') as allowed",
    [role, signature]
  );
  return rows[0].allowed;
}
