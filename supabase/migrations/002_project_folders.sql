-- Migration: Add project_folders table and folder_id to projects
-- Run this in Supabase SQL Editor

-- 1. Create project_folders table
CREATE TABLE IF NOT EXISTS project_folders (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    color       text DEFAULT '#3b82f6',
    created_at  timestamptz DEFAULT now()
);

-- 2. Add folder_id to projects
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES project_folders(id) ON DELETE SET NULL;

-- 3. Enable RLS on project_folders
ALTER TABLE project_folders ENABLE ROW LEVEL SECURITY;

-- 4. Allow admins full access, others read-only
CREATE POLICY "admins_all_folders" ON project_folders
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "all_users_read_folders" ON project_folders
    FOR SELECT USING (auth.role() = 'authenticated');
