-- STAGED ONLY: do not apply to production until approved.
create sequence if not exists public.costing_reference_seq;
create table if not exists public.costing_sheets (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null default ('CST-' || to_char(now(),'YY') || '-' || lpad(nextval('public.costing_reference_seq')::text,5,'0')),
  type text not null check (type in ('woven','knits')),
  buyer_id uuid null,
  customer text not null,
  style text,
  document jsonb not null,
  version integer not null default 1 check(version>=1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.costing_sheet_versions (
  id bigint generated always as identity primary key,
  costing_id uuid not null references public.costing_sheets(id) on delete restrict,
  version integer not null,
  document jsonb not null,
  created_at timestamptz not null default now(),
  unique(costing_id,version)
);
create index if not exists costing_sheets_customer_idx on public.costing_sheets(customer);
create index if not exists costing_sheets_updated_idx on public.costing_sheets(updated_at desc);
alter table public.costing_sheets enable row level security;
alter table public.costing_sheet_versions enable row level security;
-- Match existing application access policies before applying; no blanket public grants.
