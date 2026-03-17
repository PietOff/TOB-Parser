-- Migration 003: add automatisch_advies column to locations
ALTER TABLE locations ADD COLUMN IF NOT EXISTS automatisch_advies text;
COMMENT ON COLUMN locations.automatisch_advies IS 'Automatisch advies uit sectie 3.5 TOB: wel of geen aanleiding voor verontreiniging';
