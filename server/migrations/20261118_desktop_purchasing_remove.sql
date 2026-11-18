CREATE OR REPLACE FUNCTION public.desktop_remove_purchasing_document(
 actor uuid, operation uuid, kind text, target uuid, expected jsonb
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.purchasing_create_receipts%ROWTYPE;
 payload jsonb:=jsonb_build_object('delete',target,'expected',expected);
 line_table text;
 history_table text;
 parent_column text;
 observed jsonb;
 observed_lines jsonb;
 observed_history jsonb;
BEGIN
 IF actor IS NULL OR operation IS NULL OR target IS NULL
  OR coalesce(jsonb_typeof(expected->'header'),'')<>'object'
  OR coalesce(jsonb_typeof(expected->'lines'),'')<>'array'
  OR coalesce(jsonb_typeof(expected->'history'),'')<>'array' THEN RETURN 'invalid'; END IF;
 CASE kind
 WHEN 'purchase_orders' THEN
  line_table:='purchase_order_items'; history_table:='purchase_order_changelog'; parent_column:='po_id';
 WHEN 'work_orders' THEN
  line_table:='work_order_items'; history_table:='work_order_changelog'; parent_column:='wo_id';
 ELSE RETURN 'invalid';
 END CASE;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin'
   AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE) THEN RETURN 'unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-purchasing:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.purchasing_create_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.kind=kind AND prior.payload=payload THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id=$1 FOR UPDATE',kind) INTO observed USING target;
 IF observed IS NULL OR (observed-'passkey_hash') IS DISTINCT FROM expected->'header' THEN RETURN 'conflict'; END IF;
 EXECUTE format('SELECT 1 FROM public.%I WHERE %I=$1 ORDER BY id FOR UPDATE',line_table,parent_column) USING target;
 EXECUTE format('SELECT 1 FROM public.%I WHERE %I=$1 ORDER BY id FOR UPDATE',history_table,parent_column) USING target;
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),''[]'') FROM public.%I t WHERE %I=$1',line_table,parent_column)
  INTO observed_lines USING target;
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),''[]'') FROM public.%I t WHERE %I=$1',history_table,parent_column)
  INTO observed_history USING target;
 IF observed_lines IS DISTINCT FROM expected->'lines' OR observed_history IS DISTINCT FROM expected->'history' THEN RETURN 'conflict'; END IF;
 -- The normal web delete removes the document and its child rows.
 EXECUTE format('DELETE FROM public.%I WHERE %I=$1',line_table,parent_column) USING target;
 EXECUTE format('DELETE FROM public.%I WHERE %I=$1',history_table,parent_column) USING target;
 EXECUTE format('DELETE FROM public.%I WHERE id=$1',kind) USING target;
 INSERT INTO desktop_private.purchasing_create_receipts VALUES(operation,actor,kind,payload);
 RETURN 'applied';
EXCEPTION WHEN foreign_key_violation OR unique_violation THEN RETURN 'conflict';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_remove_purchasing_document(uuid,uuid,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_remove_purchasing_document(uuid,uuid,text,uuid,jsonb) TO service_role;
