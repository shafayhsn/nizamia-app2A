-- ============================================================
-- NIZAMIA APPARELS OMS — App-2 Database Schema
-- ============================================================

-- ============================================================
-- BUYERS
-- ============================================================
CREATE TABLE buyers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  country TEXT,
  currency TEXT DEFAULT 'USD' CHECK (currency IN ('USD','EUR','GBP')),
  default_incoterms TEXT,
  default_ship_mode TEXT CHECK (default_ship_mode IN ('Sea','Air','Courier')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUPPLIERS
-- ============================================================
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  category TEXT, -- Fabric, Trims, Packing, CMT, Wash, Print, Embroidery
  lead_time_days INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LIBRARY — BOM Master Items
-- ============================================================
CREATE TABLE library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Fabric','Stitching Trim','Packing Trim')),
  description TEXT,
  unit TEXT NOT NULL, -- yards, meters, pcs, kg, cone, set, sht, ctn
  default_wastage NUMERIC(5,2) DEFAULT 5.0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BOM PRESETS — Named bundles per buyer
-- ============================================================
CREATE TABLE bom_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID REFERENCES buyers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bom_preset_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id UUID REFERENCES bom_presets(id) ON DELETE CASCADE,
  library_item_id UUID REFERENCES library_items(id),
  wastage NUMERIC(5,2),
  notes TEXT
);

-- ============================================================
-- JOBS
-- ============================================================
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number TEXT UNIQUE NOT NULL, -- NZ-YYSS
  buyer_id UUID REFERENCES buyers(id),
  season TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,

  -- General Info
  job_number TEXT, -- denormalized for display
  buyer_id UUID REFERENCES buyers(id),
  buyer_name TEXT,
  merchandiser_name TEXT,
  factory_ref TEXT,
  product_id TEXT,
  style_number TEXT,
  description TEXT,
  po_number TEXT,
  po_date DATE,
  ship_date DATE,
  planned_date DATE,
  ship_mode TEXT CHECK (ship_mode IN ('Sea','Air','Courier')),
  incoterms TEXT,
  season TEXT,
  currency TEXT DEFAULT 'USD',
  exchange_rate_snapshot NUMERIC(12,4),

  -- Assets
  style_image_url TEXT,
  tech_pack_url TEXT,

  -- Status
  status TEXT DEFAULT 'Draft' CHECK (status IN ('Draft','Confirmed','In Production','Shipped','Cancelled')),

  -- Step completion flags
  step_po_matrix BOOLEAN DEFAULT FALSE,
  step_bom BOOLEAN DEFAULT FALSE,
  step_fitting BOOLEAN DEFAULT FALSE,
  step_sampling BOOLEAN DEFAULT FALSE,
  step_washing BOOLEAN DEFAULT FALSE,
  step_embellishment BOOLEAN DEFAULT FALSE,
  step_finishing BOOLEAN DEFAULT FALSE,
  step_processes BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SIZE GROUPS (PO Matrix)
-- ============================================================
CREATE TABLE size_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  group_name TEXT NOT NULL,
  unit_price NUMERIC(12,2),
  currency TEXT DEFAULT 'USD',
  sizes TEXT[] NOT NULL DEFAULT '{}', -- ['XS','S','M','L','XL']
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE size_group_colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  size_group_id UUID REFERENCES size_groups(id) ON DELETE CASCADE,
  color_name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE size_group_breakdown (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  size_group_id UUID REFERENCES size_groups(id) ON DELETE CASCADE,
  color_id UUID REFERENCES size_group_colors(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  qty INTEGER DEFAULT 0
);

-- ============================================================
-- BOM
-- ============================================================
CREATE TABLE bom_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  library_item_id UUID REFERENCES library_items(id),

  -- Item details (can override library)
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Fabric','Stitching Trim','Packing Trim')),
  specification TEXT,
  unit TEXT NOT NULL,
  supplier_id UUID REFERENCES suppliers(id),

  -- Usage rule
  usage_rule TEXT NOT NULL CHECK (usage_rule IN ('Generic','By Color','By Size Group','By Individual Sizes','Configure Own')),
  base_qty NUMERIC(12,4),
  wastage NUMERIC(5,2) DEFAULT 5.0,

  -- For Configure Own — stored as JSON {groupName: qty}
  custom_usage JSONB,

  sort_order INTEGER DEFAULT 0,
  notes TEXT
);

-- ============================================================
-- FITTING (Step 4)
-- ============================================================
CREATE TABLE fitting (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE UNIQUE,
  fit_block TEXT,
  spec_ref TEXT,
  fitting_date DATE,
  comments TEXT,
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending','Passed','Failed','Requires Revision'))
);

-- ============================================================
-- SAMPLING (Step 5)
-- ============================================================
CREATE TABLE samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  sample_number TEXT UNIQUE, -- SAM-YYSS-NN
  sample_type TEXT, -- Proto, Fit, Salesman, PP, TOP
  color TEXT,
  size TEXT,
  requested_date DATE,
  due_date DATE,
  received_date DATE,
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending','Requested','Received','Approved','Rejected')),
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- WASHING (Step 6)
-- ============================================================
CREATE TABLE washing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  color_id UUID REFERENCES size_group_colors(id),
  color_name TEXT,
  wash_type TEXT,
  wash_ref TEXT,
  wash_image_url TEXT,
  recipe TEXT,
  vendor_id UUID REFERENCES suppliers(id),
  notes TEXT
);

-- ============================================================
-- EMBELLISHMENT (Step 7)
-- ============================================================
CREATE TABLE embellishments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  technique TEXT, -- Screen Print, Embroidery, Heat Transfer, Woven Label, etc.
  placement TEXT,
  dimensions TEXT,
  artwork_ref TEXT,
  artwork_url TEXT,
  colors_used TEXT,
  applies_to TEXT[], -- color names or ['All']
  qty INTEGER,
  vendor_id UUID REFERENCES suppliers(id),
  approval_status TEXT DEFAULT 'Pending' CHECK (approval_status IN ('Pending','Approved','Rejected')),
  notes TEXT
);

-- ============================================================
-- FINISHING / PACKING (Step 8)
-- ============================================================
CREATE TABLE finishing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE UNIQUE,
  packing_method TEXT, -- Flat, Hanger, Folded
  carton_type TEXT, -- Solid, Assorted
  pcs_per_carton INTEGER,
  carton_length_cm NUMERIC(8,2),
  carton_width_cm NUMERIC(8,2),
  carton_height_cm NUMERIC(8,2),
  gross_weight_kg NUMERIC(8,2),
  notes TEXT
);

CREATE TABLE finishing_color_packing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finishing_id UUID REFERENCES finishing(id) ON DELETE CASCADE,
  color_name TEXT,
  ratio TEXT, -- e.g. "1:2:3:2:1"
  cartons INTEGER,
  total_pcs INTEGER
);

-- ============================================================
-- PROCESSES (Step 9)
-- ============================================================
CREATE TABLE order_processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  process_name TEXT NOT NULL,
  is_custom BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0
);

-- ============================================================
-- PURCHASING — PURCHASE ORDERS
-- ============================================================
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT UNIQUE NOT NULL, -- NZP-YYSS-NNN
  order_id UUID REFERENCES orders(id),
  job_id UUID REFERENCES jobs(id),
  supplier_id UUID REFERENCES suppliers(id),
  po_date DATE DEFAULT CURRENT_DATE,
  delivery_date DATE,
  currency TEXT DEFAULT 'PKR',
  payment_terms TEXT,
  status TEXT DEFAULT 'Draft' CHECK (status IN ('Draft','Issued','Acknowledged','Delivered','Cancelled')),
  notes TEXT,
  passkey_hash TEXT, -- for edit protection
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  specification TEXT,
  qty NUMERIC(12,4),
  unit TEXT,
  unit_rate NUMERIC(12,2),
  amount NUMERIC(14,2),
  taxable BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE purchase_order_changelog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  change_description TEXT,
  previous_status TEXT
);

-- ============================================================
-- WORK ORDERS
-- ============================================================
CREATE TABLE work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_number TEXT UNIQUE NOT NULL, -- NZW-YYSS-NNN
  order_id UUID REFERENCES orders(id),
  job_id UUID REFERENCES jobs(id),
  vendor_id UUID REFERENCES suppliers(id),
  vendor_phone TEXT,
  factory_ref TEXT,
  issue_date DATE DEFAULT CURRENT_DATE,
  start_date DATE,
  first_output_date DATE,
  complete_by DATE,
  daily_output INTEGER,
  payment_terms TEXT,
  color TEXT,
  qty INTEGER,
  processes TEXT[], -- ticked process names from Step 9
  status TEXT DEFAULT 'Draft' CHECK (status IN ('Draft','Issued','In Progress','Completed','Cancelled')),
  notes TEXT,
  passkey_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE work_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
  process_name TEXT NOT NULL,
  dept_info TEXT,
  qty NUMERIC(12,4),
  unit TEXT,
  rate NUMERIC(12,2),
  amount NUMERIC(14,2),
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE work_order_changelog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  change_description TEXT
);

-- ============================================================
-- SETTINGS
-- ============================================================
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES
  ('gst_rate', '17'),
  ('packing_tolerance_pct', '5'),
  ('passkey_hash', '03ac674216f3e15c761ee1a5e255f067953623c8f648d4e'), -- 1234
  ('company_name', 'Nizamia Apparels'),
  ('company_address', 'Karachi, Pakistan'),
  ('tc_english', 'All goods must conform to approved specifications. Delivery must be made by the date specified. Invoice must reference PO number.'),
  ('tc_urdu', ''),
  ('base_currency', 'PKR');

-- ============================================================
-- COUNTERS — for auto-numbering
-- ============================================================
CREATE TABLE counters (
  key TEXT PRIMARY KEY, -- e.g. 'job_2601', 'po_2601', 'wo_2601', 'sam_2601'
  value INTEGER DEFAULT 0
);

-- ============================================================
-- EXCHANGE RATES (snapshots)
-- ============================================================
CREATE TABLE exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency TEXT NOT NULL,
  rate NUMERIC(12,4) NOT NULL, -- PKR per 1 unit of currency
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_orders_buyer ON orders(buyer_id);
CREATE INDEX idx_orders_job ON orders(job_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_ship_date ON orders(ship_date);
CREATE INDEX idx_bom_items_order ON bom_items(order_id);
CREATE INDEX idx_size_groups_order ON size_groups(order_id);
CREATE INDEX idx_samples_order ON samples(order_id);
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_work_orders_vendor ON work_orders(vendor_id);

-- ============================================================
-- UPDATED_AT trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_jobs_updated BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_buyers_updated BEFORE UPDATE ON buyers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_po_updated BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_wo_updated BEFORE UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
