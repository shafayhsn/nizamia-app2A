-- App-2A v34 Settings Jobs Control + UI group row colour
-- Safe to run more than once.

-- Stores global grouped parent row styling used by grouped tables.
CREATE TABLE IF NOT EXISTS app_settings (
  section TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO app_settings(section, value)
VALUES (
  'ui_group_row',
  '{"background":"#fdf6e3","text":"#111827"}'::jsonb
)
ON CONFLICT (section) DO NOTHING;
