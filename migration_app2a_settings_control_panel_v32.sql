-- App-2A Settings Control Panel v1
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS app_settings (
  section TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_numbering (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type TEXT UNIQUE NOT NULL,
  label TEXT,
  prefix TEXT,
  pattern TEXT,
  seq_pad INT DEFAULT 3,
  next_number INT DEFAULT 1,
  enabled BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS uoms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT,
  type TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ui_status_colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL,
  status_value TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'gray',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(module, status_value)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_restricted BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS restricted_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS restricted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS restricted_by UUID;

INSERT INTO app_settings(section, value) VALUES
('tax', '{"sales_tax_rate":18,"sales_tax_refund_percent":100,"rebate_percent":1}'::jsonb),
('defaults', '{"currency":"USD","payment_terms_days":50,"shipment_status":"Open","pkr_rate":278.5}'::jsonb)
ON CONFLICT (section) DO NOTHING;

INSERT INTO document_numbering(doc_type,label,prefix,pattern,seq_pad,next_number,enabled,sort_order) VALUES
('job','Job Number','NZ','{PREFIX}-{YY}{SEASON}-{SEQ}',2,1,true,1),
('po','Purchase Order','NZP','{PREFIX}-{YY}{SEASON}-{SEQ}',3,1,true,2),
('pd','Purchase Demand','PD','{PREFIX}-{YY}{SEASON}-{SEQ}',3,1,true,3),
('wo','Work Order','NZW','{PREFIX}-{YY}{SEASON}-{SEQ}',3,1,true,4),
('shipment','Shipment','SHP','{PREFIX}-{SEQ}',4,1,true,5),
('invoice','Invoice','INV','{PREFIX}-{YY}-{SEQ}',3,1,true,6)
ON CONFLICT (doc_type) DO NOTHING;

INSERT INTO uoms(code,name,type,is_active,sort_order) VALUES
('PCS','Pieces','Quantity',true,1),
('MTR','Meter','Length',true,2),
('YDS','Yards','Length',true,3),
('KG','Kilogram','Weight',true,4),
('CTN','Carton','Packing',true,5)
ON CONFLICT (code) DO NOTHING;

INSERT INTO ui_status_colors(module,status_value,color,sort_order) VALUES
('orders','Draft','yellow',1),('orders','Active','blue',2),('orders','Completed','green',3),('orders','Cancelled','red',4),
('queues','Pending','gray',10),('queues','Active','blue',11),('queues','Completed','green',12),
('shipments','Open','blue',20),('shipments','Draft','gray',21),('shipments','Completed','green',22),
('payments','Pipeline','gray',30),('payments','Partial','yellow',31),('payments','Complete','green',32),('payments','Overdue','red',33)
ON CONFLICT (module, status_value) DO NOTHING;
