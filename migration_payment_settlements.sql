-- App-2A Payments / Shipment Settlement persistence
create table if not exists payment_settlements (
  shipment_id uuid primary key references shipments(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payment_settlements_updated_at on payment_settlements(updated_at desc);
