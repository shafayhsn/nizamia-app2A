-- Apply once before deploying the Orders batch UI.
create table if not exists public.production_batches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);
create table if not exists public.production_batch_orders (
  order_id uuid primary key references public.orders(id) on delete cascade,
  batch_id uuid not null references public.production_batches(id) on delete restrict,
  assigned_at timestamptz not null default now()
);
create index if not exists production_batch_orders_batch_idx on public.production_batch_orders(batch_id);
-- Match existing application authorization approach; review RLS with app auth design before enabling.
grant select,insert,update,delete on public.production_batches to authenticated;
grant select,insert,update,delete on public.production_batch_orders to authenticated;
