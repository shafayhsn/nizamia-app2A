-- ============================================================
-- APP-2A — Sampling comments + logs persistence migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1) Extend samples so version lineage can be stored in DB as well
ALTER TABLE samples
  ADD COLUMN IF NOT EXISTS parent_sample_id UUID REFERENCES samples(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS root_sample_id   UUID REFERENCES samples(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version_no       INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS version_label    TEXT NOT NULL DEFAULT 'V1',
  ADD COLUMN IF NOT EXISTS stage            TEXT NOT NULL DEFAULT 'Not Started',
  ADD COLUMN IF NOT EXISTS approval_status  TEXT NOT NULL DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS dispatch_status  TEXT NOT NULL DEFAULT 'In Development',
  ADD COLUMN IF NOT EXISTS last_comment_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_comment_by  TEXT;

ALTER TABLE samples
  DROP CONSTRAINT IF EXISTS samples_stage_check;

ALTER TABLE samples
  ADD CONSTRAINT samples_stage_check
  CHECK (stage IN ('Not Started', 'Pattern', 'Cutting', 'Stitching', 'Washing', 'Finishing', 'Ready'));

ALTER TABLE samples
  DROP CONSTRAINT IF EXISTS samples_approval_status_check;

ALTER TABLE samples
  ADD CONSTRAINT samples_approval_status_check
  CHECK (approval_status IN ('Pending', 'Approved', 'Rejected', 'Revision Required'));

ALTER TABLE samples
  DROP CONSTRAINT IF EXISTS samples_dispatch_status_check;

ALTER TABLE samples
  ADD CONSTRAINT samples_dispatch_status_check
  CHECK (dispatch_status IN ('In Development', 'Pending Parcel', 'Dispatched', 'Comments Received'));

CREATE INDEX IF NOT EXISTS idx_samples_order_id ON samples(order_id);
CREATE INDEX IF NOT EXISTS idx_samples_parent_sample_id ON samples(parent_sample_id);
CREATE INDEX IF NOT EXISTS idx_samples_root_sample_id ON samples(root_sample_id);
CREATE INDEX IF NOT EXISTS idx_samples_sample_number ON samples(sample_number);

-- 2) Sample comments table
CREATE TABLE IF NOT EXISTS sample_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id UUID NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  root_sample_id UUID REFERENCES samples(id) ON DELETE SET NULL,
  sample_number TEXT,
  version_label TEXT,
  comment_type TEXT NOT NULL CHECK (comment_type IN ('Approval', 'Revision', 'Rejection')),
  comment_text TEXT NOT NULL,
  comment_by TEXT NOT NULL,
  comment_date DATE NOT NULL,
  is_buyer_comment BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sample_comments_sample_id ON sample_comments(sample_id);
CREATE INDEX IF NOT EXISTS idx_sample_comments_root_sample_id ON sample_comments(root_sample_id);
CREATE INDEX IF NOT EXISTS idx_sample_comments_created_at ON sample_comments(created_at DESC);

-- 3) Sample logs / audit trail table
CREATE TABLE IF NOT EXISTS sample_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id UUID NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  root_sample_id UUID REFERENCES samples(id) ON DELETE SET NULL,
  sample_number TEXT,
  version_label TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created',
    'comment_added',
    'stage_changed',
    'status_changed',
    'version_created',
    'parcel_sent',
    'field_updated'
  )),
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  event_text TEXT,
  acted_by TEXT,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sample_logs_sample_id ON sample_logs(sample_id);
CREATE INDEX IF NOT EXISTS idx_sample_logs_root_sample_id ON sample_logs(root_sample_id);
CREATE INDEX IF NOT EXISTS idx_sample_logs_event_at ON sample_logs(event_at DESC);
CREATE INDEX IF NOT EXISTS idx_sample_logs_event_type ON sample_logs(event_type);

-- 4) Backfill root/version fields for existing records
UPDATE samples
SET root_sample_id = id
WHERE root_sample_id IS NULL;

UPDATE samples
SET version_no = 1
WHERE version_no IS NULL OR version_no < 1;

UPDATE samples
SET version_label = 'V' || COALESCE(version_no, 1)
WHERE version_label IS NULL OR version_label = '';

-- Done
