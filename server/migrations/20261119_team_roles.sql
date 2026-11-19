CREATE FUNCTION public.save_team_role(actor uuid, target uuid, role_name text, grants jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE role_key uuid:=target; saved_name text;
BEGIN
 IF NOT EXISTS(SELECT FROM public.users WHERE id=actor AND role='admin' AND is_active AND NOT coalesce(is_restricted,false) AND deleted_at IS NULL FOR SHARE) THEN RAISE insufficient_privilege; END IF;
 IF target IS NULL THEN
   IF role_name IS NULL OR role_name !~ '^[[:alnum:]_ -]{1,64}$' OR lower(role_name)='admin' THEN RAISE invalid_parameter_value; END IF;
   INSERT INTO public.roles(id,name) VALUES(gen_random_uuid(),lower(btrim(role_name))) RETURNING id INTO role_key;
 ELSE
   SELECT name INTO STRICT saved_name FROM public.roles WHERE id=target FOR UPDATE;
   IF lower(saved_name)='admin' THEN RAISE insufficient_privilege; END IF;
 END IF;
 IF jsonb_typeof(grants) IS DISTINCT FROM 'array' OR jsonb_array_length(grants)>200 THEN RAISE invalid_parameter_value; END IF;
 INSERT INTO public.permissions(role_id,module,can_view,can_create,can_edit,can_delete)
 SELECT role_key,g.module,g.module<>'settings' AND coalesce(g.can_view,false),
 g.module<>'settings' AND coalesce(g.can_create,false),g.module<>'settings' AND coalesce(g.can_edit,false),g.module<>'settings' AND coalesce(g.can_delete,false)
 FROM jsonb_to_recordset(grants) AS g(module text,can_view boolean,can_create boolean,can_edit boolean,can_delete boolean)
 ON CONFLICT(role_id,module) DO UPDATE SET can_view=excluded.can_view,can_create=excluded.can_create,can_edit=excluded.can_edit,can_delete=excluded.can_delete;
 RETURN role_key;
END $$;
REVOKE ALL ON FUNCTION public.save_team_role(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_team_role(uuid,uuid,text,jsonb) TO service_role;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.roles,public.permissions FROM PUBLIC,anon,authenticated;
