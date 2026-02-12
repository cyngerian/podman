-- Security definer helpers to break RLS self-reference recursion
-- Policies on group_members and draft_players referenced themselves,
-- causing infinite recursion. These functions bypass RLS.

CREATE OR REPLACE FUNCTION public.user_group_ids(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT group_id FROM public.group_members WHERE user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.user_draft_ids(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT draft_id FROM public.draft_players WHERE user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.is_group_admin(p_group_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_user_id AND role = 'admin'
  );
$$;

-- Fix group_members policies (self-referencing)

DROP POLICY IF EXISTS "group_members_select" ON public.group_members;
CREATE POLICY "group_members_select" ON public.group_members
  FOR SELECT TO authenticated USING (
    group_id IN (SELECT public.user_group_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "group_members_insert" ON public.group_members;
CREATE POLICY "group_members_insert" ON public.group_members
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    OR public.is_group_admin(group_id, auth.uid())
  );

DROP POLICY IF EXISTS "group_members_delete" ON public.group_members;
CREATE POLICY "group_members_delete" ON public.group_members
  FOR DELETE TO authenticated USING (
    user_id = auth.uid()
    OR public.is_group_admin(group_id, auth.uid())
  );

-- Fix groups policies (references group_members)

DROP POLICY IF EXISTS "groups_select" ON public.groups;
CREATE POLICY "groups_select" ON public.groups
  FOR SELECT TO authenticated USING (
    created_by = auth.uid()
    OR id IN (SELECT public.user_group_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "groups_update" ON public.groups;
CREATE POLICY "groups_update" ON public.groups
  FOR UPDATE TO authenticated USING (
    public.is_group_admin(id, auth.uid())
  );

-- Fix draft_proposals policies (references group_members)

DROP POLICY IF EXISTS "draft_proposals_select" ON public.draft_proposals;
CREATE POLICY "draft_proposals_select" ON public.draft_proposals
  FOR SELECT TO authenticated USING (
    group_id IN (SELECT public.user_group_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "draft_proposals_insert" ON public.draft_proposals;
CREATE POLICY "draft_proposals_insert" ON public.draft_proposals
  FOR INSERT TO authenticated WITH CHECK (
    group_id IN (SELECT public.user_group_ids(auth.uid()))
    AND proposed_by = auth.uid()
  );

DROP POLICY IF EXISTS "draft_proposals_update" ON public.draft_proposals;
CREATE POLICY "draft_proposals_update" ON public.draft_proposals
  FOR UPDATE TO authenticated USING (
    proposed_by = auth.uid()
    OR public.is_group_admin(group_id, auth.uid())
  );

-- Fix proposal_votes policies (references group_members via draft_proposals)

DROP POLICY IF EXISTS "proposal_votes_select" ON public.proposal_votes;
CREATE POLICY "proposal_votes_select" ON public.proposal_votes
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.draft_proposals dp
      WHERE dp.id = proposal_votes.proposal_id
        AND dp.group_id IN (SELECT public.user_group_ids(auth.uid()))
    )
  );

-- Fix draft_players policies (self-referencing)

DROP POLICY IF EXISTS "draft_players_select" ON public.draft_players;
CREATE POLICY "draft_players_select" ON public.draft_players
  FOR SELECT TO authenticated USING (
    draft_id IN (SELECT public.user_draft_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "draft_players_insert" ON public.draft_players;
CREATE POLICY "draft_players_insert" ON public.draft_players
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.drafts WHERE id = draft_players.draft_id AND host_id = auth.uid())
  );

DROP POLICY IF EXISTS "draft_players_delete" ON public.draft_players;
CREATE POLICY "draft_players_delete" ON public.draft_players
  FOR DELETE TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.drafts WHERE id = draft_players.draft_id AND host_id = auth.uid())
  );

-- Fix drafts select policy (references draft_players)

DROP POLICY IF EXISTS "drafts_select" ON public.drafts;
CREATE POLICY "drafts_select" ON public.drafts
  FOR SELECT TO authenticated USING (
    id IN (SELECT public.user_draft_ids(auth.uid()))
  );
