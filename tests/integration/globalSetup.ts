import { ensureSupabaseEnv } from "./helpers/env";

/**
 * Fails the run before any test starts if the local Supabase stack isn't up,
 * and exports the connection details the suite needs.
 */
export default function setup() {
  ensureSupabaseEnv();
}
