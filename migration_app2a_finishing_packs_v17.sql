-- App-2A v17 finishing save support
-- Run this if your finishing plan/program does not read saved packing rows.
ALTER TABLE finishing_packs ADD COLUMN IF NOT EXISTS order_id UUID;
ALTER TABLE finishing_packs ADD COLUMN IF NOT EXISTS pack_basis TEXT;
ALTER TABLE finishing_packs ADD COLUMN IF NOT EXISTS pcs_per_carton NUMERIC;
ALTER TABLE finishing_packs ADD COLUMN IF NOT EXISTS inner_pack_type TEXT;
ALTER TABLE finishing_packs ADD COLUMN IF NOT EXISTS pieces_per_inner_pack NUMERIC;
ALTER TABLE finishing_packs ADD COLUMN IF NOT EXISTS carton_style TEXT;

UPDATE finishing_packs fp
SET order_id = f.order_id
FROM finishing f
WHERE fp.finishing_id = f.id
  AND fp.order_id IS NULL;
