-- ============================================================
-- Migration 001: Extend locations & researches tables
-- Run this once in Supabase Dashboard > SQL Editor
-- ============================================================

-- ── locations: add missing columns ──────────────────────────
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS locatienaam        text,
  ADD COLUMN IF NOT EXISTS status             text,
  ADD COLUMN IF NOT EXISTS conclusie          text,
  ADD COLUMN IF NOT EXISTS veiligheidsklasse  text,
  ADD COLUMN IF NOT EXISTS melding            text,
  ADD COLUMN IF NOT EXISTS mkb                text,
  ADD COLUMN IF NOT EXISTS brl7000            text,
  ADD COLUMN IF NOT EXISTS opmerking          text,
  ADD COLUMN IF NOT EXISTS lat                double precision,
  ADD COLUMN IF NOT EXISTS lon                double precision,
  ADD COLUMN IF NOT EXISTS rd_x               double precision,
  ADD COLUMN IF NOT EXISTS rd_y               double precision,
  ADD COLUMN IF NOT EXISTS enriched_data      jsonb,
  ADD COLUMN IF NOT EXISTS stoffen            jsonb,
  ADD COLUMN IF NOT EXISTS status_abel        text DEFAULT 'Nog te doen',
  ADD COLUMN IF NOT EXISTS opmerkingen_abel   text,
  ADD COLUMN IF NOT EXISTS afstand_trace      double precision,
  ADD COLUMN IF NOT EXISTS source_file        text,
  ADD COLUMN IF NOT EXISTS rapport_jaar       integer;

-- Rename latitude/longitude to lat/lon to match app code
-- (only if the old columns still exist AND new ones don't — safe to skip if already done)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='locations' AND column_name='latitude')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='locations' AND column_name='lat') THEN
    ALTER TABLE public.locations RENAME COLUMN latitude TO lat;
    ALTER TABLE public.locations RENAME COLUMN longitude TO lon;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='locations' AND column_name='latitude')
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='locations' AND column_name='lat') THEN
    -- Both exist: copy old to new and drop old
    UPDATE public.locations SET lat = latitude, lon = longitude WHERE lat IS NULL;
    ALTER TABLE public.locations DROP COLUMN IF EXISTS latitude;
    ALTER TABLE public.locations DROP COLUMN IF EXISTS longitude;
  END IF;
END $$;

-- ── researches: RLS + type column already exists ─────────────
-- Make sure RLS allows inserts/selects by authenticated users

-- Drop existing policies (safe — they'll be recreated)
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.locations;
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.researches;
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.projects;
DROP POLICY IF EXISTS "Users can view all projects" ON public.projects;
DROP POLICY IF EXISTS "Users can insert projects" ON public.projects;
DROP POLICY IF EXISTS "Users can view all locations" ON public.locations;
DROP POLICY IF EXISTS "Users can insert locations" ON public.locations;
DROP POLICY IF EXISTS "Users can view all researches" ON public.researches;
DROP POLICY IF EXISTS "Users can insert researches" ON public.researches;
DROP POLICY IF EXISTS "authenticated_all" ON public.projects;
DROP POLICY IF EXISTS "authenticated_all" ON public.locations;
DROP POLICY IF EXISTS "authenticated_all" ON public.researches;

-- Enable RLS
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.researches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Simple permissive policies: any authenticated user can read/write
-- (For a multi-tenant setup, tighten these later)
CREATE POLICY "authenticated_all" ON public.projects
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON public.locations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON public.researches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Also allow service_role (bypasses RLS by default, but explicit is fine)
-- service_role key already bypasses RLS entirely in Supabase

NOTIFY pgrst, 'reload schema';
