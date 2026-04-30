-- Optional manual tracking URL per shipment
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS tracking_link TEXT;
