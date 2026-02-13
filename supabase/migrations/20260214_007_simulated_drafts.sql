-- ============================================================================
-- Simulated Drafts: add is_simulated flag, make group_id nullable
-- ============================================================================

-- Add is_simulated flag (defaults false for all existing drafts)
ALTER TABLE public.drafts ADD COLUMN is_simulated boolean NOT NULL DEFAULT false;

-- Make group_id nullable so simulated drafts can exist without a group
ALTER TABLE public.drafts ALTER COLUMN group_id DROP NOT NULL;

-- Allow host to read their own simulated drafts
-- (existing drafts_select requires being in draft_players within a group context)
CREATE POLICY "drafts_select_simulated" ON public.drafts
  FOR SELECT TO authenticated USING (
    is_simulated = true AND host_id = (SELECT auth.uid())
  );
