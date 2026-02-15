-- Add emoji column to groups
-- This was previously added via the Supabase dashboard; this migration
-- makes it reproducible and rewindable.

ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS emoji text;
