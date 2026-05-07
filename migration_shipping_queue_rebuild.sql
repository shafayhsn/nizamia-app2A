-- App-2A Shipping Queue Rebuild support columns
-- Safe to run more than once in Supabase SQL editor.

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS container_no text,
  ADD COLUMN IF NOT EXISTS container_number text,
  ADD COLUMN IF NOT EXISTS cro_lp_no text,
  ADD COLUMN IF NOT EXISTS booking_ref text;

ALTER TABLE shipment_lines
  ADD COLUMN IF NOT EXISTS ship_qty numeric,
  ADD COLUMN IF NOT EXISTS shipped_qty numeric,
  ADD COLUMN IF NOT EXISTS cartons numeric,
  ADD COLUMN IF NOT EXISTS cbm numeric,
  ADD COLUMN IF NOT EXISTS value numeric,
  ADD COLUMN IF NOT EXISTS close_queue boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS close_reason text;
