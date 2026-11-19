-- Opaque per-session token for revalidating previously authorized browser responses.
CREATE FUNCTION public.nzos_read_version() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT md5(u.id::text||':'||coalesce(u.role,'')||':'||coalesce(u.role_id::text,'')||':'||
 (SELECT coalesce(max(revision),0)::text FROM nzos_private.sync_changes))
 FROM nzos_private.edit_sessions e JOIN public.users u ON u.id=e.user_id
 WHERE e.proof_hash=sha256(convert_to(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-nzos-edit-proof','UTF8'))
 AND e.expires_at>now() AND u.is_active AND NOT coalesce(u.is_restricted,false) AND u.deleted_at IS NULL
$$;
REVOKE ALL ON FUNCTION public.nzos_read_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nzos_read_version() TO anon,authenticated;
