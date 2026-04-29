-- F8 Login + Settings Upgrade
alter table public.users add column if not exists username text;
create unique index if not exists users_username_unique_idx on public.users (lower(username)) where username is not null and username <> '';
update public.users set username = split_part(email, '@', 1) where (username is null or username = '') and email is not null;
