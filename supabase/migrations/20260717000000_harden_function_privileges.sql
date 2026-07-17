-- Harden function privileges per Supabase security advisors (2026-07-17):
--
-- 1. update_updated_at had a mutable search_path (missed by the PR #20
--    hardening pass, which only covered SECURITY DEFINER functions).
-- 2. SECURITY DEFINER functions were executable by anon via /rest/v1/rpc/.
--    The RLS helpers (is_group_admin, user_group_ids, user_draft_ids) only
--    need EXECUTE for authenticated — RLS policies evaluate them as the
--    querying role, so authenticated MUST keep EXECUTE or every policy
--    that references them breaks. anon has no policy that uses them.
--    handle_new_user and update_updated_at are trigger functions that run
--    with owner privileges — no API role needs EXECUTE at all.
--
-- Intentionally still callable:
--   get_invite_info(uuid)          — anon + authenticated (public invite page)
--   accept_group_invite(uuid)      — authenticated
--   get_booster_product_json(text) — anon + authenticated (public booster API)

-- 1. Pin search_path on the trigger function
ALTER FUNCTION public.update_updated_at() SET search_path = '';

-- 2. Trigger functions: no API role should call these directly
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;

-- 3. RLS helpers: authenticated keeps EXECUTE (required by policies),
--    anon and PUBLIC lose it
REVOKE EXECUTE ON FUNCTION public.is_group_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_group_ids(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_draft_ids(uuid) FROM PUBLIC, anon;

-- 4. accept_group_invite requires a signed-in user (it reads auth.uid());
--    anon gains nothing from calling it, so drop anon access
REVOKE EXECUTE ON FUNCTION public.accept_group_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_group_invite(uuid) TO authenticated;

-- Re-assert the intentional public grants so this migration is
-- self-documenting and idempotent against prior REVOKE experiments
GRANT EXECUTE ON FUNCTION public.get_invite_info(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_booster_product_json(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_group_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_draft_ids(uuid) TO authenticated;
