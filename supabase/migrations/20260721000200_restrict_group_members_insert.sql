-- Close the group_members self-join hole.
--
-- The previous policy allowed `user_id = auth.uid()` unconditionally, so any
-- authenticated user who knew (or guessed) a group's UUID could insert their own
-- membership row and bypass the invite flow entirely.
--
-- The self-insert clause only ever existed to let `createGroup` add the creator's
-- own admin row through the user-scoped client. That is now the only self-insert
-- permitted: you may insert yourself, as an admin, into a group you created.
--
-- Paths that keep working:
--   * createGroup      — creator inserts their own `admin` row (groups.created_by)
--   * admin add member — public.is_group_admin(group_id, auth.uid())
--   * accept_group_invite / invite links — SECURITY DEFINER, bypasses RLS
--   * server actions using the admin client — bypasses RLS

DROP POLICY IF EXISTS "group_members_insert" ON public.group_members;

CREATE POLICY "group_members_insert" ON public.group_members
  FOR INSERT TO authenticated WITH CHECK (
    -- An existing group admin adding anyone (including themselves).
    public.is_group_admin(group_id, (select auth.uid()))
    -- The group's creator seeding their own admin membership row. This is not
    -- one-shot: a creator who left their own group can rejoin it as admin.
    -- That is intended — "you can always get back into a group you created".
    OR (
      user_id = (select auth.uid())
      AND role = 'admin'
      AND EXISTS (
        SELECT 1
        FROM public.groups g
        WHERE g.id = group_members.group_id
          AND g.created_by = (select auth.uid())
      )
    )
  );
