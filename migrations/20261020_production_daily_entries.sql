-- Isolated production register. No triggers or writes to existing operational tables.
create table if not exists public.production_daily_entries (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null,
 size_group_id uuid not null,
 color_id uuid not null,
 job_number text not null,
 buyer_name text,
 style_number text,
 po_number text,
 store_name text,
 wash_name text,
 size_group_name text,
 department text not null check (department in ('Cutting','Stitching','Washing','Back Process','Finishing','Packing','Embroidery','Printing','Other')),
 movement text not null check (movement in ('completed','sent','received')),
 production_date date not null,
 production_at text,
 quantity integer not null check (quantity > 0),
 created_by uuid default auth.uid(),
 created_at timestamptz not null default now()
);
create index if not exists production_daily_entries_date_idx on public.production_daily_entries(production_date);
create index if not exists production_daily_entries_variant_idx on public.production_daily_entries(order_id,size_group_id,color_id,department);
alter table public.production_daily_entries enable row level security;
-- Pilot access uses existing authenticated app users. Tighten policies for role-specific rollout.
create policy "production_authenticated_read" on public.production_daily_entries for select to authenticated using (true);
create policy "production_authenticated_insert" on public.production_daily_entries for insert to authenticated with check (created_by = auth.uid());
