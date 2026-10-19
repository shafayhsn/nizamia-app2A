-- Phase 13.16: UI-only Tasks. No Supabase Auth/RLS is enabled.
-- WARNING: Access to these tables is NOT confidential; any holder of the anon key
-- can potentially read/write tasks. Do not store sensitive content in tasks.
create table if not exists public.app_tasks (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 assignee_id uuid not null references public.users(id),
 created_by uuid not null references public.users(id),
 due_date date not null,
 priority text not null default 'Normal',
 status text not null default 'Pending',
 description text not null default '',
 related_record text not null default '',
 completed_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.app_task_comments (
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null references public.app_tasks(id) on delete cascade,
 user_id uuid not null references public.users(id),
 body text not null,
 created_at timestamptz not null default now()
);
create table if not exists public.app_task_reads (
 task_id uuid not null references public.app_tasks(id) on delete cascade,
 user_id uuid not null references public.users(id),
 read_at timestamptz not null default now(),
 primary key(task_id,user_id)
);
create index if not exists app_tasks_assignee_due_idx on public.app_tasks(assignee_id,due_date);
create index if not exists app_tasks_created_by_idx on public.app_tasks(created_by);
create index if not exists app_task_comments_task_idx on public.app_task_comments(task_id,created_at);
-- Temporary compatibility with existing application-managed login (NOT SECURE).
grant select,insert,update on public.app_tasks to anon,authenticated;
grant select,insert on public.app_task_comments to anon,authenticated;
grant select,insert,update on public.app_task_reads to anon,authenticated;
