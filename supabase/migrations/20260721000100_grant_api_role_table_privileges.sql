-- Make the API-role table grants reproducible from migrations (task podman-13).
--
-- Every public table in production and staging grants the full DML set to
-- `anon`, `authenticated`, and `service_role` — Supabase's historical default
-- for the public schema. Those grants were never written down: they came from
-- the default privileges in place when the projects were created, not from a
-- migration.
--
-- Newer Supabase CLI versions no longer include DML in the public-schema
-- default privileges, so a database rebuilt from `supabase/migrations/`
-- (`npx supabase start`, `db reset`, or a brand-new project) came up with the
-- schema but *no* table access: every request failed with
-- `42501 permission denied for table ...`, including service-role writes. The
-- RLS integration suite is the first thing to build the schema from scratch,
-- which is how this surfaced.
--
-- Applying this against prod/staging is a no-op — GRANT is idempotent and the
-- privileges are already there.
--
-- Security note: table-level grants are not the authorization boundary here.
-- RLS is enabled on all 13 public tables and denies by default, so `anon` and
-- `authenticated` still only see what a policy admits. This mirrors the stock
-- Supabase model.
--
-- Deliberately scoped to TABLES and SEQUENCES: a blanket
-- `GRANT ALL ON ALL FUNCTIONS` would re-grant EXECUTE on the SECURITY DEFINER
-- helpers that 20260717000000_harden_function_privileges.sql revoked from
-- `anon`. Function privileges stay hand-managed, per function.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Future tables created by this role inherit the same grants, so the next
-- migration that adds a table doesn't have to remember this.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
