-- Run once in Supabase SQL Editor before using the global timestamp feature.
-- Tracks successful INSERT/UPDATE/DELETE on public application tables.
create table if not exists public.app_database_sync_status (
  id integer primary key check (id = 1),
  last_saved_at timestamptz
);
insert into public.app_database_sync_status (id, last_saved_at) values (1, null)
on conflict (id) do nothing;
alter table public.app_database_sync_status enable row level security;
revoke all on public.app_database_sync_status from anon, authenticated;
grant select on public.app_database_sync_status to authenticated;
drop policy if exists "Authenticated users can read sync status" on public.app_database_sync_status;
create policy "Authenticated users can read sync status" on public.app_database_sync_status
for select to authenticated using (true);

create or replace function public.app_record_database_write()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  update public.app_database_sync_status set last_saved_at = clock_timestamp() where id = 1;
  return null;
end;
$$;
revoke all on function public.app_record_database_write() from public, anon, authenticated;

-- Install on ordinary public tables (excluding the status table itself).
-- If you add more app tables later, re-run this DO block to register them.
do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
      and c.relname <> 'app_database_sync_status'
      and c.relname not like 'spatial_ref_sys%'
  loop
    execute format('drop trigger if exists app_database_write_tracking on public.%I',t.relname);
    execute format('create trigger app_database_write_tracking after insert or update or delete on public.%I for each statement execute function public.app_record_database_write()',t.relname);
  end loop;
end $$;
