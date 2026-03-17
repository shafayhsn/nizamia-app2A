-- ============================================================
-- NIZAMIA APP-2 — Migration
-- Run this in Supabase → SQL Editor → New Query → Run
-- ============================================================

-- 1. Orders table — new columns
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS style_image_base64  TEXT,
  ADD COLUMN IF NOT EXISTS agent_name          TEXT,
  ADD COLUMN IF NOT EXISTS in_store_date       DATE,
  ADD COLUMN IF NOT EXISTS port_of_loading     TEXT,
  ADD COLUMN IF NOT EXISTS port_of_discharge   TEXT,
  ADD COLUMN IF NOT EXISTS notes               TEXT,
  ADD COLUMN IF NOT EXISTS total_qty           INTEGER,
  ADD COLUMN IF NOT EXISTS total_value_usd     NUMERIC(14,2);

-- 2. Fitting table — store size group rows as JSON
ALTER TABLE fitting
  ADD COLUMN IF NOT EXISTS rows JSONB;

-- 3. Finishing table — packing configs + checklist
ALTER TABLE finishing
  ADD COLUMN IF NOT EXISTS tolerance_pct  NUMERIC(5,2) DEFAULT 5,
  ADD COLUMN IF NOT EXISTS configs        JSONB,
  ADD COLUMN IF NOT EXISTS checklist      JSONB;

-- 4. Washing table — turnaround days + wash reference image
ALTER TABLE washing
  ADD COLUMN IF NOT EXISTS turnaround_days    INTEGER,
  ADD COLUMN IF NOT EXISTS wash_image_base64  TEXT;

-- 5. Counter function (needed for job/PO/sample number generation)
--    Only run this if it doesn't exist yet
CREATE OR REPLACE FUNCTION increment_counter(counter_key TEXT)
RETURNS INTEGER AS $$
DECLARE
  new_val INTEGER;
BEGIN
  INSERT INTO counters (key, value) VALUES (counter_key, 1)
  ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
  RETURNING value INTO new_val;
  RETURN new_val;
END;
$$ LANGUAGE plpgsql;

-- Done. All migrations applied.

-- Size Group Templates (Library → Size Groups tab)
CREATE TABLE IF NOT EXISTS size_group_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  buyer_id UUID REFERENCES buyers(id) ON DELETE SET NULL,
  buyer_name TEXT,
  sizes TEXT[] NOT NULL DEFAULT '{}',
  base_size TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Additional columns (run if not already done)
ALTER TABLE bom_items
  ADD COLUMN IF NOT EXISTS final_qty  NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS po_status  TEXT DEFAULT 'No PO';

