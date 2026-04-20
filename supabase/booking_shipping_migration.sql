-- Booking & Shipping module for App-2A
-- Safe to run once. Review existing objects before re-running in production.

create extension if not exists pgcrypto;

create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_no text not null unique,
  shipment_date date not null default current_date,
  container_no text null,
  booking_ref text null,
  etd date null,
  eta date null,
  status text not null default 'Open',
  notes text null,
  created_at timestamptz not null default now()
);

create table if not exists shipment_lines (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  queue_id uuid null references order_queues(id) on delete set null,
  shipped_qty numeric not null check (shipped_qty > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_shipment_lines_shipment_id on shipment_lines(shipment_id);
create index if not exists idx_shipment_lines_order_id on shipment_lines(order_id);
create index if not exists idx_shipment_lines_queue_id on shipment_lines(queue_id);
create index if not exists idx_shipments_shipment_date on shipments(shipment_date);

alter table shipments drop constraint if exists shipments_status_check;
alter table shipments add constraint shipments_status_check check (status in ('Open','Closed','Cancelled'));
