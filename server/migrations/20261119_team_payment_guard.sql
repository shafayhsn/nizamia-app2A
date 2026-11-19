CREATE FUNCTION public.is_verified_payment_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT FROM nzos_private.edit_sessions e JOIN public.users u ON u.id=e.user_id
 WHERE e.proof_hash=sha256(convert_to(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-nzos-edit-proof','UTF8'))
 AND e.expires_at>now() AND u.role='admin' AND u.is_active AND NOT coalesce(u.is_restricted,false) AND u.deleted_at IS NULL);
$$;
REVOKE ALL ON FUNCTION public.is_verified_payment_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_verified_payment_admin() TO anon,authenticated;
ALTER TABLE public.payment_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY nzos_payment_admin_guard ON public.payment_settlements AS RESTRICTIVE FOR ALL TO anon,authenticated
 USING ((select public.is_verified_payment_admin())) WITH CHECK ((select public.is_verified_payment_admin()));
CREATE POLICY nzos_payment_admin_access ON public.payment_settlements FOR ALL TO anon,authenticated
 USING ((select public.is_verified_payment_admin())) WITH CHECK ((select public.is_verified_payment_admin()));
