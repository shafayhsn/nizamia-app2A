CREATE SCHEMA IF NOT EXISTS nzos_private;
REVOKE ALL ON SCHEMA nzos_private FROM PUBLIC,anon,authenticated;
CREATE TABLE nzos_private.edit_sessions (
  proof_hash bytea PRIMARY KEY, user_id uuid NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE nzos_private.edit_history (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  saved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  user_id uuid, username text NOT NULL, source text NOT NULL,
  table_name text NOT NULL, record_id text, operation text NOT NULL,
  fields text[] NOT NULL, stage_before text, stage_after text
);
REVOKE ALL ON ALL TABLES IN SCHEMA nzos_private FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.users ADD COLUMN deleted_at timestamptz;
CREATE FUNCTION public.open_edit_session(actor uuid, proof text, expiry timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF length(proof)<>64 OR expiry>now()+interval '8 hours 1 minute' OR expiry<=now() THEN RAISE invalid_parameter_value; END IF;
  IF NOT EXISTS(SELECT FROM public.users WHERE id=actor AND is_active AND NOT coalesce(is_restricted,false) AND deleted_at IS NULL) THEN RAISE insufficient_privilege; END IF;
  DELETE FROM nzos_private.edit_sessions WHERE expires_at<=now();
  INSERT INTO nzos_private.edit_sessions VALUES(sha256(convert_to(proof,'UTF8')),actor,expiry) ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION public.close_edit_session(proof text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  DELETE FROM nzos_private.edit_sessions WHERE proof_hash=sha256(convert_to(proof,'UTF8'));
$$;
CREATE FUNCTION public.retire_team_account(actor uuid,target uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;
  IF actor=target OR NOT EXISTS(SELECT FROM public.users WHERE id=actor AND role='admin' AND is_active AND NOT coalesce(is_restricted,false) AND deleted_at IS NULL)
  THEN RAISE insufficient_privilege; END IF;
  IF NOT EXISTS(SELECT FROM public.users WHERE id=target) THEN RAISE no_data_found; END IF;
  IF EXISTS(SELECT FROM public.po_approval_requests WHERE approver_id=target AND approved_at IS NULL) THEN
    RAISE EXCEPTION 'Reassign pending PO approvals before deleting this account.';
  END IF;
  UPDATE public.users SET deleted_at=now(),is_active=false,is_restricted=true,password_hash='disabled',restricted_reason='Account deleted',restricted_at=now()
    WHERE id=target AND deleted_at IS NULL;
  DELETE FROM nzos_private.edit_sessions WHERE user_id=target;
END $$;
CREATE FUNCTION nzos_private.capture_edit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  headers jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  api_role text:=current_setting('role',true);
  actor uuid; label text; actor_role text; origin text; before_row jsonb; after_row jsonb; row_data jsonb; changed text[];
BEGIN
  IF api_role IN ('anon','authenticated') THEN
    SELECT u.id,u.username,u.role INTO actor,label,actor_role FROM nzos_private.edit_sessions s JOIN public.users u ON u.id=s.user_id
      WHERE s.proof_hash=sha256(convert_to(headers->>'x-nzos-edit-proof','UTF8')) AND s.expires_at>now()
      AND u.deleted_at IS NULL AND u.is_active AND NOT coalesce(u.is_restricted,false);
    IF actor IS NULL OR (TG_TABLE_NAME IN ('users','permissions','roles','payment_settlements') AND actor_role IS DISTINCT FROM 'admin') THEN RAISE insufficient_privilege; END IF;
    origin:='Web';
  ELSIF api_role='service_role' AND headers ? 'x-nzos-actor' THEN
    SELECT id,username INTO STRICT actor,label FROM public.users WHERE id=(headers->>'x-nzos-actor')::uuid AND deleted_at IS NULL AND is_active AND NOT coalesce(is_restricted,false);
    origin:=CASE WHEN headers->>'x-nzos-source'='Mac' THEN 'Mac' ELSE 'Web' END;
  ELSE
    origin:='Database';label:='System';
  END IF;
  IF TG_OP<>'INSERT' THEN before_row:=to_jsonb(OLD); END IF;
  IF TG_OP<>'DELETE' THEN after_row:=to_jsonb(NEW); END IF;
  row_data:=coalesce(after_row,before_row);
  SELECT array_agg(k ORDER BY k) INTO changed FROM jsonb_object_keys(row_data) k
    WHERE before_row->k IS DISTINCT FROM after_row->k;
  IF changed IS NOT NULL THEN
    INSERT INTO nzos_private.edit_history(user_id,username,source,table_name,record_id,operation,fields,stage_before,stage_after)
    VALUES(actor,coalesce(label,'System'),origin,TG_TABLE_NAME,coalesce(row_data->>'id',row_data->>'po_id',row_data->>'parcel_id',row_data->>'key'),
      TG_OP,changed,CASE WHEN TG_TABLE_NAME='samples' AND 'stage'=ANY(changed) THEN before_row->>'stage' END,
      CASE WHEN TG_TABLE_NAME='samples' AND 'stage'=ANY(changed) THEN after_row->>'stage' END);
  END IF;
  RETURN NULL;
END $$;
CREATE FUNCTION public.read_team_history(actor uuid, before_id bigint)
RETURNS SETOF nzos_private.edit_history LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS(SELECT FROM public.users WHERE id=actor AND role='admin' AND is_active AND NOT coalesce(is_restricted,false) AND deleted_at IS NULL)
  THEN RAISE insufficient_privilege; END IF;
  RETURN QUERY SELECT * FROM nzos_private.edit_history WHERE before_id IS NULL OR event_id<before_id ORDER BY event_id DESC LIMIT 100;
END $$;
REVOKE ALL ON FUNCTION public.read_team_history(uuid,bigint),public.open_edit_session(uuid,text,timestamptz),public.close_edit_session(text),public.retire_team_account(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_team_history(uuid,bigint),public.open_edit_session(uuid,text,timestamptz),public.close_edit_session(text),public.retire_team_account(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION nzos_private.capture_edit() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND NOT c.relispartition
    AND NOT EXISTS(SELECT FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
    AND c.relname<>'offline_sync_operations'
  LOOP
    EXECUTE format('CREATE TRIGGER nzos_capture_edit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION nzos_private.capture_edit()',t.relname);
  END LOOP;
END $$;
