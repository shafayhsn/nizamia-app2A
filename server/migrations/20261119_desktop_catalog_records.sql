CREATE OR REPLACE FUNCTION public.desktop_save_catalog_record(actor uuid, operation uuid, kind text, verb text, target uuid, payload jsonb, expected jsonb)
RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 allowed text[]; patch jsonb:=payload->'patch'; previous jsonb:=expected->'previous';
 current_row jsonb; item text; cols text; vals text; assignments text;
 receipt desktop_private.operational_receipts%ROWTYPE;
BEGIN
 IF actor IS NULL OR operation IS NULL OR target IS NULL OR verb IS DISTINCT FROM 'save' THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor AND role='admin' AND is_active IS TRUE AND is_restricted IS NOT TRUE FOR SHARE) THEN RETURN 'unauthorized'; END IF;
 allowed:=CASE kind
 WHEN 'library_items' THEN string_to_array('name category description unit default_wastage notes composition weight width_inches shrinkage colour weave_construction packing_form is_active',' ')
 WHEN 'size_group_templates' THEN string_to_array('name sizes buyer_id buyer_name base_size is_active',' ')
 WHEN 'app_tasks' THEN string_to_array('title assignee_id due_date priority description related_record status completed_at',' ')
 WHEN 'app_task_comments' THEN ARRAY['task_id','body']
 WHEN 'pp_meetings' THEN string_to_array('meeting_date status decision technical_checks fit_approved department_notes outstanding_actions signatures',' ')
 WHEN 'costing_batches' THEN ARRAY['name'] END;
 IF allowed IS NULL OR jsonb_typeof(patch) IS DISTINCT FROM 'object' OR patch='{}' OR previous IS NULL OR
 EXISTS(SELECT FROM jsonb_object_keys(patch) k WHERE NOT k=ANY(allowed)) THEN RETURN 'invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(operation::text,0));
 SELECT * INTO receipt FROM desktop_private.operational_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF (receipt.actor_id,receipt.kind,receipt.verb,receipt.target,receipt.payload,receipt.expected) IS NOT DISTINCT FROM (actor,kind,verb,target,payload,expected) THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',kind) INTO current_row USING target;
 IF previous='null' THEN
  IF current_row IS NOT NULL THEN RETURN 'conflict'; END IF;
  IF kind='pp_meetings' THEN RETURN 'invalid'; END IF;
  IF kind='app_task_comments' THEN patch:=patch||jsonb_build_object('user_id',actor); END IF;
  IF kind='app_tasks' THEN patch:=patch||jsonb_build_object('created_by',actor,'status','Pending'); END IF;
 ELSE
  IF current_row IS NULL OR NOT current_row @> previous THEN RETURN 'conflict'; END IF;
  IF jsonb_typeof(previous)<>'object' OR EXISTS(SELECT FROM jsonb_object_keys(patch) k WHERE NOT previous ? k)
   OR kind IN ('app_task_comments','costing_batches') THEN RETURN 'invalid'; END IF;
 END IF;
 IF kind='app_tasks' AND patch ? 'assignee_id' AND NOT EXISTS(SELECT FROM public.users WHERE id=(patch->>'assignee_id')::uuid AND is_active IS TRUE) THEN RETURN 'invalid'; END IF;
 IF (patch ? 'name' AND nullif(trim(patch->>'name'),'') IS NULL) OR (patch ? 'title' AND nullif(trim(patch->>'title'),'') IS NULL)
 OR (kind='app_task_comments' AND nullif(trim(patch->>'body'),'') IS NULL) THEN RETURN 'invalid'; END IF;
 IF previous='null' THEN patch:=patch||jsonb_build_object('id',target); END IF;
 SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('p.%I',k),',' ORDER BY k),
 string_agg(format('%I=p.%I',k,k),',' ORDER BY k) INTO cols,vals,assignments FROM jsonb_object_keys(patch) k;
 IF previous='null' THEN
  EXECUTE format('INSERT INTO public.%1$I (%2$s) SELECT %3$s FROM jsonb_populate_record(NULL::public.%1$I,$1) p',kind,cols,vals) USING patch;
 ELSE
  EXECUTE format('UPDATE public.%1$I t SET %2$s FROM jsonb_populate_record(NULL::public.%1$I,$1) p WHERE t.id=$2',kind,assignments) USING patch,target;
 END IF;
 INSERT INTO desktop_private.operational_receipts VALUES(operation,actor,kind,verb,target,payload,expected);
 RETURN 'applied';
EXCEPTION WHEN unique_violation OR foreign_key_violation THEN RETURN 'conflict';
 WHEN check_violation OR not_null_violation OR data_exception THEN RETURN 'invalid';
END $$;
REVOKE ALL ON FUNCTION public.desktop_save_catalog_record(uuid,uuid,text,text,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_save_catalog_record(uuid,uuid,text,text,uuid,jsonb,jsonb) TO service_role;
