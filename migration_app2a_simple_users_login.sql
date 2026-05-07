-- App-2A simple users login migration
-- Run this once in Supabase SQL editor.
-- After this, User Management can create users directly inside App-2A.

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS username text;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS password text;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique
ON public.users (lower(username))
WHERE username IS NOT NULL AND username <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
ON public.users (lower(email))
WHERE email IS NOT NULL AND email <> '';
