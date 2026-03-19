-- Migration 004: add trace_geojson column to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS trace_geojson jsonb;
COMMENT ON COLUMN projects.trace_geojson IS 'GeoJSON LineString voor de projecttracé. Null = geen tracé opgeslagen.';
