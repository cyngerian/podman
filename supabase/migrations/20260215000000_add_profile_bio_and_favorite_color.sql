-- Add bio and favorite_color columns to profiles
-- These were previously added via the Supabase dashboard; this migration
-- makes them reproducible and rewindable.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS favorite_color text;
