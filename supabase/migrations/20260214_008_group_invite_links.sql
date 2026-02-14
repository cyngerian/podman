-- Replace static group invite codes with time-limited invite links
-- and remove the signup invite gate (invites table)

-- 1. Create group_invites table
CREATE TABLE public.group_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  use_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;

-- RLS: group admins can manage invites
CREATE POLICY "group_invites_select" ON public.group_invites
  FOR SELECT TO authenticated USING (
    public.is_group_admin(group_id, (select auth.uid()))
  );

CREATE POLICY "group_invites_insert" ON public.group_invites
  FOR INSERT TO authenticated WITH CHECK (
    public.is_group_admin(group_id, (select auth.uid()))
    AND created_by = (select auth.uid())
  );

CREATE POLICY "group_invites_delete" ON public.group_invites
  FOR DELETE TO authenticated USING (
    public.is_group_admin(group_id, (select auth.uid()))
  );

-- 2. RPC: accept_group_invite (SECURITY DEFINER so any authenticated user can call)
CREATE OR REPLACE FUNCTION public.accept_group_invite(p_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invite record;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT gi.id, gi.group_id, gi.expires_at
  INTO v_invite
  FROM public.group_invites gi
  WHERE gi.token = p_token;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid invite link';
  END IF;

  IF v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'This invite link has expired';
  END IF;

  -- Idempotent: if already a member, just return the group_id
  IF EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = v_invite.group_id AND user_id = v_user_id
  ) THEN
    RETURN v_invite.group_id;
  END IF;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_invite.group_id, v_user_id, 'member');

  UPDATE public.group_invites
  SET use_count = use_count + 1
  WHERE id = v_invite.id;

  RETURN v_invite.group_id;
END;
$$;

-- 3. RPC: get_invite_info (SECURITY DEFINER so unauthenticated users can see group name)
CREATE OR REPLACE FUNCTION public.get_invite_info(p_token uuid)
RETURNS TABLE(group_name text, group_description text, expires_at timestamptz, is_expired boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    g.name::text AS group_name,
    g.description::text AS group_description,
    gi.expires_at,
    (gi.expires_at < now()) AS is_expired
  FROM public.group_invites gi
  JOIN public.groups g ON g.id = gi.group_id
  WHERE gi.token = p_token;
END;
$$;

-- Grant execute to anon so unauthenticated users can call get_invite_info
GRANT EXECUTE ON FUNCTION public.get_invite_info(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.accept_group_invite(uuid) TO authenticated;

-- 4. Drop old infrastructure

-- Drop old join_group_by_invite_code RPC
DROP FUNCTION IF EXISTS public.join_group_by_invite_code(text);

-- Drop invite_code column and index from groups
ALTER TABLE public.groups DROP COLUMN IF EXISTS invite_code;

-- Drop old invites table (signup gate)
DROP POLICY IF EXISTS "invites_select_anon" ON public.invites;
DROP POLICY IF EXISTS "invites_select" ON public.invites;
DROP POLICY IF EXISTS "invites_insert" ON public.invites;
DROP POLICY IF EXISTS "invites_update" ON public.invites;
DROP TABLE IF EXISTS public.invites;
