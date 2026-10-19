-- REVIEW BEFORE APPLYING. This app currently authenticates using public.users,
-- not Supabase Auth. Real confidentiality requires a trusted server-side auth layer.
create table if not exists public.app_tasks (
 id uuid primary key default gen_random_uuid(),
 title text not null, assignee_id uuid not null, created_by uuid not null,
 due_date date not null, priority text not null default 'Normal',
 status text not null default 'Pending', description text not null default '',
 related_record text not null default '', completed_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.app_task_comments (
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.app_tasks(id) on delete cascade,
 user_id uuid not null, body text not null, created_at timestamptz not null default now()
);
-- DO NOT enable client access to these tables without server-side identity enforcement.
-- Tasks UI requires a secured API or appropriate authenticated RLS policies.
