-- App-2A v35 Jobs Control + Job Numbering Engine Fix
-- Safe to run more than once.

-- 1) UI group parent row colour setting for live app_settings schema using `key`.
INSERT INTO app_settings (key, value)
VALUES (
  'ui_group_row',
  '{"background":"#fdf6e3","text":"#111827"}'::jsonb
)
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- 2) Ensure document_numbering columns used by App-2A settings exist.
ALTER TABLE document_numbering ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE document_numbering ADD COLUMN IF NOT EXISTS pattern TEXT;
ALTER TABLE document_numbering ADD COLUMN IF NOT EXISTS seq_pad INT DEFAULT 2;
ALTER TABLE document_numbering ADD COLUMN IF NOT EXISTS next_number INT DEFAULT 1;
ALTER TABLE document_numbering ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE document_numbering ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
ALTER TABLE document_numbering ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- 3) Reset job numbering to follow Settings format and start from 01.
INSERT INTO document_numbering (doc_type, label, prefix, pattern, seq_pad, next_number, enabled, sort_order)
VALUES ('job', 'Job Number', 'NZ-26', '{PREFIX}{SEQ}', 2, 1, TRUE, 1)
ON CONFLICT (doc_type)
DO UPDATE SET
  label = EXCLUDED.label,
  prefix = EXCLUDED.prefix,
  pattern = EXCLUDED.pattern,
  seq_pad = EXCLUDED.seq_pad,
  next_number = 1,
  enabled = TRUE,
  updated_at = NOW();

-- 4) Optional cleanup: delete idle jobs only. Existing linked jobs stay protected.
DELETE FROM jobs j
WHERE NOT EXISTS (
  SELECT 1 FROM orders o WHERE o.job_id = j.id
);
