-- ============================================================================
-- podman Seed: Bootstrap site admin and first invite
-- ============================================================================
--
-- USAGE:
-- 1. Start local Supabase: npx supabase start
-- 2. Create your admin user via the Auth UI or CLI
-- 3. Run this seed with your admin user's UUID:
--
--    ADMIN_USER_ID='your-uuid-here' npx supabase db reset
--
-- Or manually set the UUID below before running.
-- ============================================================================

-- Set your admin user ID here (replace with actual UUID after first sign-up)
-- This is a placeholder — the real flow is:
--   1. Sign up via the app
--   2. Run: UPDATE profiles SET is_site_admin = true WHERE id = '<your-uuid>';
--   3. Create an invite code for friends

-- Create a bootstrap invite code (usable by the first person to sign up)
-- The site admin can create more invites after claiming this one
insert into public.invites (code, created_by)
select
  'PODMAN-BOOTSTRAP-2026',
  id
from public.profiles
where is_site_admin = true
limit 1;

-- If no admin exists yet (first run), this is a no-op.
-- After promoting yourself to admin, re-run: npx supabase db reset
