-- App-table user notifications: one read receipt per user and deadline event.
-- Install before deploying Phase 10 for cross-device persistence.
CREATE TABLE IF NOT EXISTS public.notification_reads (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,event_id)
);
CREATE INDEX IF NOT EXISTS notification_reads_user_idx ON public.notification_reads(user_id);
-- IMPORTANT: This application uses custom public.users authentication rather than
-- Supabase Auth. Restrict table access through an authenticated backend/API
-- before using this for confidential per-user data. Never assume anon RLS
-- policies can identify the app user.
