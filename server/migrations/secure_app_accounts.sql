-- Apply only after the new web and API deployments pass QA and are live.
BEGIN;
REVOKE ALL ON TABLE public.users FROM PUBLIC, anon, authenticated;
REVOKE SELECT (password_hash), INSERT (password_hash), UPDATE (password_hash)
  ON TABLE public.users FROM PUBLIC, anon, authenticated;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO service_role;
COMMIT;
