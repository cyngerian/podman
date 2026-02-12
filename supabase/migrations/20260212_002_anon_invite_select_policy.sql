-- Allow anonymous users to check and claim invite codes during signup
-- The signup server action runs as anon because the user isn't authenticated yet
-- SELECT: needed to validate the invite code
-- UPDATE: needed to mark the invite as claimed after signUp()

CREATE POLICY "invites_anon_select" ON public.invites
  FOR SELECT
  TO anon
  USING (claimed_by IS NULL);

CREATE POLICY "invites_anon_update" ON public.invites
  FOR UPDATE
  TO anon
  USING (claimed_by IS NULL)
  WITH CHECK (claimed_by IS NOT NULL);
