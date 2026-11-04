-- PP Meeting records. Apply to Nizamia OMS after review, before enabling the UI.
create sequence if not exists public.pp_meeting_number_seq start 1;
create table if not exists public.pp_meetings (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete restrict,
 ppm_number text not null unique default ('PPM-' || lpad(nextval('public.pp_meeting_number_seq')::text,6,'0')),
 meeting_date date,
 status text not null default 'Draft' check (status in ('Draft','Completed','Closed')),
 decision text check (decision in ('Ready for production','Conditional approval','Hold')),
 technical_checks jsonb not null default '{}'::jsonb,
 fit_approved boolean,
 department_notes jsonb not null default '{}'::jsonb,
 outstanding_actions text not null default '',
 signatures jsonb not null default '{}'::jsonb,
 attachment_path text,
 created_by uuid default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists pp_meetings_order_idx on public.pp_meetings(order_id,created_at desc);
alter table public.pp_meetings enable row level security;
-- Match existing company-wide authenticated access until role-based permissions are wired.
create policy "pp_meetings_authenticated_read" on public.pp_meetings for select to authenticated using (auth.uid() is not null);
create policy "pp_meetings_authenticated_insert" on public.pp_meetings for insert to authenticated with check (auth.uid() is not null and created_by = auth.uid());
create policy "pp_meetings_authenticated_update" on public.pp_meetings for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
grant select,insert,update on public.pp_meetings to authenticated;
grant usage,select on sequence public.pp_meeting_number_seq to authenticated;
