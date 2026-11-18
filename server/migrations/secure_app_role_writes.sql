-- Apply after the role administration endpoint has been deployed.
BEGIN;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.roles, public.permissions FROM PUBLIC, anon, authenticated;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_roles_read ON public.roles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY app_permissions_read ON public.permissions FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.roles, public.permissions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.roles, public.permissions TO service_role;
COMMIT;
