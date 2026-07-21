/**
 * Resolves the local Supabase connection details for the RLS suite.
 *
 * Explicit `SUPABASE_TEST_*` vars win, so CI (or a developer with a
 * non-default stack) can point the suite anywhere. Otherwise we shell out to
 * `supabase status -o env` — the only source of truth that stays correct if
 * the local stack's ports or keys ever change.
 *
 * Called from both `globalSetup.ts` (fail fast, before any test runs) and
 * lazily from the client factories, so it works regardless of whether the
 * worker inherited the parent process's env.
 */
import { execFileSync } from "node:child_process";

export const REQUIRED_VARS = [
  "SUPABASE_TEST_URL",
  "SUPABASE_TEST_PUBLISHABLE_KEY",
  "SUPABASE_TEST_SECRET_KEY",
] as const;

let resolved = false;

function parseStatusEnv(output: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const match = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim());
    if (match) vars[match[1]] = match[2];
  }
  return vars;
}

function readStatus(): Record<string, string> {
  try {
    const output = execFileSync("npx", ["supabase", "status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return parseStatusEnv(output);
  } catch (error) {
    throw new Error(
      "Could not read local Supabase status. Start it with `npx supabase start` " +
        "before running the RLS suite.\n" +
        (error instanceof Error ? error.message : String(error))
    );
  }
}

export function ensureSupabaseEnv(): void {
  if (resolved) return;
  if (REQUIRED_VARS.every((name) => process.env[name])) {
    resolved = true;
    return;
  }

  const status = readStatus();
  process.env.SUPABASE_TEST_URL ||= status.API_URL;
  // Legacy JWT keys first: the local stack's `sb_publishable_*` / `sb_secret_*`
  // pair does not map onto the `anon` / `service_role` Postgres roles the way
  // the hosted platform does, and RLS is exactly what this suite measures.
  // Production uses the new format; the role behaviour under test is identical.
  process.env.SUPABASE_TEST_PUBLISHABLE_KEY ||=
    status.ANON_KEY || status.PUBLISHABLE_KEY;
  process.env.SUPABASE_TEST_SECRET_KEY ||=
    status.SERVICE_ROLE_KEY || status.SECRET_KEY;

  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `\`supabase status\` did not report values for: ${missing.join(", ")}`
    );
  }
  resolved = true;
}
