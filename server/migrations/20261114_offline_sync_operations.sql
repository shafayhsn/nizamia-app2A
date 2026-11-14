-- Apply only after reviewing deployment environment and backup policy.
-- Never run automatically against the live CP-17 database.
CREATE TABLE IF NOT EXISTS offline_sync_operations (
  operation_id varchar(64) PRIMARY KEY,
  outcome varchar(24) NOT NULL CHECK (outcome = 'applied'),
  applied_at timestamptz NOT NULL DEFAULT now()
);
-- Restrict direct client access; only the trusted server transaction role
-- should have read/write privileges on this ledger.
