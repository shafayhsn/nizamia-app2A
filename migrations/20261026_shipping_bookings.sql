-- Booking headers, item allocations, and shipped allocations.
create table if not exists public.shipping_bookings (
 id uuid primary key default gen_random_uuid(),
 booking_no text not null unique,
 booking_date date not null default current_date,
 etd date,
 eta date,
 status text not null default 'Draft',
 notes text not null default '',
 created_at timestamptz not null default now()
);
create table if not exists public.shipping_booking_lines (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.shipping_bookings(id) on delete cascade,
 order_id uuid not null references public.orders(id),
 queue_id uuid references public.order_queues(id),
 qty numeric not null check(qty > 0),
 created_at timestamptz not null default now()
);
create table if not exists public.shipping_booking_shipments (
 id uuid primary key default gen_random_uuid(),
 booking_line_id uuid not null references public.shipping_booking_lines(id) on delete restrict,
 shipment_id uuid not null references public.shipments(id) on delete cascade,
 qty numeric not null check(qty > 0),
 unique(booking_line_id,shipment_id)
);
create index if not exists shipping_booking_lines_order_idx on public.shipping_booking_lines(order_id);
create index if not exists shipping_booking_lines_queue_idx on public.shipping_booking_lines(queue_id);
create index if not exists shipping_booking_shipments_shipment_idx on public.shipping_booking_shipments(shipment_id);
grant select,insert,update,delete on public.shipping_bookings, public.shipping_booking_lines, public.shipping_booking_shipments to anon,authenticated;
-- This app currently authenticates against public.users, not Supabase Auth.
-- Its existing browser-to-Supabase access model should be reviewed for row-level security before external access.
