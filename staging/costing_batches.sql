-- Apply to a TEST database before testing batch persistence. Do not apply to production without approval.
create table if not exists public.costing_batches (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check (length(trim(name)) between 1 and 120),
 created_at timestamptz not null default now()
);
alter table public.costing_batches enable row level security;
-- Access via the authenticated, permission-checked /api/oms server only.
alter table public.costing_sheets add column if not exists batch_id uuid references public.costing_batches(id) on delete set null;
create index if not exists costing_sheets_batch_id_idx on public.costing_sheets(batch_id);
