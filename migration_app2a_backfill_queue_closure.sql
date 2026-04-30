-- App-2A: Backfill Mode + Manual Queue Closure support
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'queue';

ALTER TABLE order_queues ADD COLUMN IF NOT EXISTS closure_type TEXT;
ALTER TABLE order_queues ADD COLUMN IF NOT EXISTS remaining_qty NUMERIC;
ALTER TABLE order_queues ADD COLUMN IF NOT EXISTS closed_by TEXT;
ALTER TABLE order_queues ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP;
