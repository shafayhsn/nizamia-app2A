-- App-2A Shipping Payments v11
-- Buyer payment terms + payment settlements table.
alter table if exists buyers add column if not exists payment_terms_days integer default 30;

create table if not exists payment_settlements (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid unique,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Optional shipment header fields used by the Shipping popup. Safe to run repeatedly.
alter table if exists shipments add column if not exists gate_pass_no text;
alter table if exists shipments add column if not exists delivery_challan_no text;
alter table if exists shipments add column if not exists gd_no text;
alter table if exists shipments add column if not exists hbl_hawb_no text;
alter table if exists shipments add column if not exists fi_no text;
alter table if exists shipments add column if not exists lc_no text;
alter table if exists shipments add column if not exists tracking_url text;
