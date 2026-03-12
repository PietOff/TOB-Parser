-- ============================================================
-- Migration 000: Initial Schema
-- Run this FIRST in a fresh Supabase project (SQL Editor).
-- Then run 001_extend_locations_researches.sql
-- Then run 002_project_folders.sql
-- ============================================================

-- ── profiles ─────────────────────────────────────────────────
-- Auto-created from auth.users via trigger (see below)
CREATE TABLE IF NOT EXISTS public.profiles (
    id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text,
    role  text DEFAULT 'user'
);

-- ── projects ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    client     text,
    folder_id  uuid,  -- FK added in migration 002
    created_at timestamptz DEFAULT now()
);

-- ── locations ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.locations (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id         uuid REFERENCES public.projects(id) ON DELETE CASCADE,
    locatiecode        text,
    locatienaam        text,
    straatnaam         text,
    huisnummer         text,
    postcode           text,
    woonplaats         text,
    status             text,
    conclusie          text,
    veiligheidsklasse  text,
    melding            text,
    mkb                text,
    brl7000            text,
    opmerking          text,
    complex            boolean DEFAULT false,
    lat                double precision,
    lon                double precision,
    rd_x               double precision,
    rd_y               double precision,
    enriched_data      jsonb,
    stoffen            jsonb,
    status_abel        text DEFAULT 'Nog te doen',
    opmerkingen_abel   text,
    afstand_trace      double precision,
    source_file        text,
    rapport_jaar       integer,
    created_at         timestamptz DEFAULT now()
);

-- ── researches ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.researches (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id  uuid REFERENCES public.locations(id) ON DELETE CASCADE,
    type         text NOT NULL,
    status       text DEFAULT 'Nog op te vragen',
    notes        text,
    document_url text,
    created_at   timestamptz DEFAULT now(),
    updated_at   timestamptz DEFAULT now()
);

-- ── project_members ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_members (
    project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
);

-- ── project_folders ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_folders (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    color      text DEFAULT '#3b82f6',
    created_at timestamptz DEFAULT now()
);

-- Add folder FK to projects (safe if already exists)
ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.project_folders(id) ON DELETE SET NULL;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.researches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_folders  ENABLE ROW LEVEL SECURITY;

-- Drop any old policies first
DROP POLICY IF EXISTS "authenticated_all" ON public.profiles;
DROP POLICY IF EXISTS "authenticated_all" ON public.projects;
DROP POLICY IF EXISTS "authenticated_all" ON public.locations;
DROP POLICY IF EXISTS "authenticated_all" ON public.researches;
DROP POLICY IF EXISTS "authenticated_all" ON public.project_members;
DROP POLICY IF EXISTS "admins_all_folders" ON public.project_folders;
DROP POLICY IF EXISTS "all_users_read_folders" ON public.project_folders;

-- Permissive: any authenticated user can read/write everything
CREATE POLICY "authenticated_all" ON public.profiles
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON public.projects
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON public.locations
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON public.researches
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON public.project_members
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON public.project_folders
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Auth trigger: auto-create profile on sign-up ─────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, role)
    VALUES (NEW.id, NEW.email, 'user')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Make yourself admin (replace with your actual user UUID) ─
-- After running this script, find your user UUID in:
-- Supabase Dashboard > Authentication > Users
-- Then run:
-- UPDATE public.profiles SET role = 'admin' WHERE id = '<your-user-uuid>';

NOTIFY pgrst, 'reload schema';
