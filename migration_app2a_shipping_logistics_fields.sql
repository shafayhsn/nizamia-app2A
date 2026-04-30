-- App-2A Shipping logistics/commercial fields
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'queue';

ALTER TABLE shipment_lines ADD COLUMN IF NOT EXISTS total_cartons NUMERIC;
ALTER TABLE shipment_lines ADD COLUMN IF NOT EXISTS cbm NUMERIC;
ALTER TABLE shipment_lines ADD COLUMN IF NOT EXISTS unit_price NUMERIC;
ALTER TABLE shipment_lines ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
ALTER TABLE shipment_lines ADD COLUMN IF NOT EXISTS shipment_value NUMERIC;
ALTER TABLE shipment_lines ADD COLUMN IF NOT EXISTS port_of_loading TEXT;
ALTER TABLE shipment_lines ADD COLUMN IF NOT EXISTS port_of_destination TEXT;
ALTER TABLE shipment_lines ADD COLUMN IF NOT EXISTS transit_days INTEGER;
ALTER TABLE shipment_lines ADD COLUMN IF NOT EXISTS eta_destination_port DATE;

ALTER TABLE order_queues ADD COLUMN IF NOT EXISTS closure_type TEXT;
ALTER TABLE order_queues ADD COLUMN IF NOT EXISTS remaining_qty NUMERIC;
ALTER TABLE order_queues ADD COLUMN IF NOT EXISTS closed_by TEXT;
ALTER TABLE order_queues ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP;
