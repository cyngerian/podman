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
  "SUPABASE_TEST_DB_URL",
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

function runStatus(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function readStatus(): Record<string, string> {
  // Prefer a `supabase` already on PATH — in CI that is the version
  // `supabase/setup-cli` pinned and used to start the stack. Falling through to
  // `npx` would download whatever is latest, adding a network dependency (and
  // possible version skew) to the suite that exists to be the flake signal.
  const attempts: [string, string[]][] = [
    ["supabase", ["status", "-o", "env"]],
    ["npx", ["supabase", "status", "-o", "env"]],
  ];

  let lastError: unknown;
  for (const [command, args] of attempts) {
    try {
      return parseStatusEnv(runStatus(command, args));
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    "Could not read local Supabase status. Start it with `npx supabase start` " +
      "before running the integration suites.\n" +
      (lastError instanceof Error ? lastError.message : String(lastError))
  );
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
  // Direct Postgres, for the handful of assertions PostgREST cannot express —
  // function EXECUTE grants and whether RLS is enabled on every table.
  process.env.SUPABASE_TEST_DB_URL ||= status.DB_URL;

  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `\`supabase status\` did not report values for: ${missing.join(", ")}`
    );
  }
  resolved = true;
}
