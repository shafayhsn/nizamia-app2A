alter table public.orders add column if not exists step_testing boolean not null default false;
create table if not exists public.testing_orders (
 id uuid primary key default gen_random_uuid(),
 supplier_id uuid not null references public.suppliers(id),
 order_number text not null unique,
 status text not null default 'ordered' check (status in ('ordered','received','completed','cancelled')),
 issued_at timestamptz not null default now(),
 notes text not null default '',
 created_at timestamptz not null default now()
);
create table if not exists public.testing_requirements (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete cascade,
 source_type text not null check (source_type in ('bom','sample')),
 source_id uuid not null,
 item_name text not null default '',
 specification text not null default '',
 test_name text not null default '',
 status text not null default 'awaiting_order' check (status in ('awaiting_order','ordered','completed','cancelled')),
 testing_order_id uuid references public.testing_orders(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(order_id,source_type,source_id)
);
create index if not exists testing_requirements_order_idx on public.testing_requirements(order_id);
create index if not exists testing_requirements_testing_order_idx on public.testing_requirements(testing_order_id);
alter table public.testing_orders enable row level security;
alter table public.testing_requirements enable row level security;
