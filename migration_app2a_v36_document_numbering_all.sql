-- App-2A v36 Document Numbering: ensure all document series exist
-- Safe to run more than once.

ALTER TABLE document_numbering ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE document_numbering ADD COLUMN IF NOT EXISTS pattern TEXT;
ALTER TABLE document_numbering ADD COLUMN IF NOT EXISTS seq_pad INT DEFAULT 2;
ALTER TABLE document_numbering ADD COLUMN IF NOT EXISTS next_number INT DEFAULT 1;
ALTER TABLE document_numbering ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE document_numbering ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
ALTER TABLE document_numbering ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

INSERT INTO document_numbering (doc_type, label, prefix, pattern, seq_pad, next_number, enabled, sort_order)
VALUES
  ('job', 'Job Number', 'NZ-26', '{PREFIX}{SEQ}', 2, 1, TRUE, 1),
  ('po', 'Purchase Order', 'NZP', '{PREFIX}-{YY}{SEASON}-{SEQ}', 3, 1, TRUE, 2),
  ('pd', 'Purchase Demand', 'PD', '{PREFIX}-{YY}{SEASON}-{SEQ}', 3, 1, TRUE, 3),
  ('wo', 'Work Order', 'NZW', '{PREFIX}-{YY}{SEASON}-{SEQ}', 3, 1, TRUE, 4),
  ('shipment', 'Shipment', 'SHP', '{PREFIX}-{SEQ}', 4, 1, TRUE, 5),
  ('invoice', 'Invoice', 'INV', '{PREFIX}-{YY}-{SEQ}', 3, 1, TRUE, 6)
ON CONFLICT (doc_type)
DO UPDATE SET
  label = COALESCE(document_numbering.label, EXCLUDED.label),
  prefix = COALESCE(document_numbering.prefix, EXCLUDED.prefix),
  pattern = COALESCE(document_numbering.pattern, EXCLUDED.pattern),
  seq_pad = COALESCE(document_numbering.seq_pad, EXCLUDED.seq_pad),
  next_number = COALESCE(document_numbering.next_number, document_numbering.current_number, EXCLUDED.next_number),
  enabled = COALESCE(document_numbering.enabled, TRUE),
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();
