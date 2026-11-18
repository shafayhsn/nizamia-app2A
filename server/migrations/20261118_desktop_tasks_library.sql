CREATE SCHEMA IF NOT EXISTS desktop_private;
REVOKE ALL ON SCHEMA desktop_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA desktop_private TO service_role;

-- The existing Library UI deactivates records so order references survive.
ALTER TABLE public.library_items ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.size_group_templates ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS desktop_private.tasks_library_receipts (
 operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, kind text NOT NULL, target uuid NOT NULL,
 verb text NOT NULL, patch jsonb, expected jsonb
);
REVOKE ALL ON desktop_private.tasks_library_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.tasks_library_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_change_tasks_library(
 actor uuid, operation uuid, kind text, target uuid, verb text, patch jsonb, expected jsonb
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 allowed text[];
 receipt desktop_private.tasks_library_receipts%ROWTYPE;
 current_row jsonb;
 current_items jsonb;
 next_items jsonb;
 column_name text;
 columns_sql text;
 values_sql text;
BEGIN
 CASE kind
 WHEN 'app_tasks' THEN allowed:=string_to_array('title assignee_id due_date priority description related_record status completed_at',' ');
 WHEN 'app_task_comments' THEN allowed:=ARRAY['task_id','body'];
 WHEN 'library_items' THEN allowed:=string_to_array('name unit notes colour weight category shrinkage composition description packing_form width_inches default_wastage weave_construction is_active',' ');
 WHEN 'size_group_templates' THEN allowed:=ARRAY['name','sizes','buyer_id','buyer_name','base_size','is_active'];
 WHEN 'bom_presets' THEN allowed:=ARRAY['name','buyer_id','members'];
 ELSE RETURN 'invalid';
 END CASE;

 IF actor IS NULL OR operation IS NULL OR target IS NULL OR verb IS NULL OR verb NOT IN ('create','update','delete')
  OR (verb='delete' AND kind<>'bom_presets') OR (kind='app_task_comments' AND verb<>'create')
  OR (verb<>'delete' AND (coalesce(jsonb_typeof(patch),'')<>'object' OR patch='{}'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(patch) k WHERE NOT k=ANY(allowed))))
  OR (verb<>'create' AND coalesce(jsonb_typeof(expected),'')<>'object')
  OR (verb='update' AND EXISTS(SELECT 1 FROM jsonb_object_keys(patch) k WHERE NOT expected ? k))
 THEN RETURN 'invalid'; END IF;

 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin' AND u.is_active IS TRUE
   AND u.is_restricted IS NOT TRUE FOR SHARE) THEN RETURN 'unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-tasks-library:'||operation::text,0));
 SELECT * INTO receipt FROM desktop_private.tasks_library_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF receipt.actor_id=actor AND receipt.kind=kind AND receipt.target=target AND receipt.verb=verb
   AND receipt.patch IS NOT DISTINCT FROM patch AND receipt.expected IS NOT DISTINCT FROM expected
  THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 INSERT INTO desktop_private.tasks_library_receipts VALUES(operation,actor,kind,target,verb,patch,expected);

 IF verb<>'create' THEN
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id=$1 FOR UPDATE',kind) INTO current_row USING target;
  IF current_row IS NULL THEN RAISE foreign_key_violation USING MESSAGE='Record no longer exists'; END IF;
  IF kind='bom_presets' THEN
   PERFORM i.id FROM public.bom_preset_items i WHERE i.preset_id=target ORDER BY i.id FOR UPDATE;
   SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]'::jsonb) INTO current_items FROM public.bom_preset_items i WHERE i.preset_id=target;
   IF current_items IS DISTINCT FROM expected->'members' THEN RAISE foreign_key_violation USING MESSAGE='Package members changed'; END IF;
  END IF;
  FOR column_name IN SELECT jsonb_object_keys(expected) LOOP
   IF column_name='members' AND kind='bom_presets' THEN CONTINUE; END IF;
   IF column_name='completed_at' AND kind='app_tasks' THEN
    IF (current_row->>'completed_at')::timestamptz IS DISTINCT FROM (expected->>'completed_at')::timestamptz
     THEN RAISE foreign_key_violation USING MESSAGE='Completion changed'; END IF;
   ELSIF current_row->column_name IS DISTINCT FROM expected->column_name THEN
    RAISE foreign_key_violation USING MESSAGE='Record changed';
   END IF;
  END LOOP;
 END IF;
 IF verb='delete' THEN
  DELETE FROM public.bom_preset_items WHERE preset_id=target;
  DELETE FROM public.bom_presets WHERE id=target;
  RETURN 'applied';
 END IF;

 IF kind='app_tasks' THEN
  IF patch ? 'assignee_id' AND NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=(patch->>'assignee_id')::uuid
   AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE)
   THEN RAISE foreign_key_violation USING MESSAGE='Assignee unavailable'; END IF;
  IF (verb='create' AND NOT patch ?& ARRAY['title','assignee_id','due_date'])
   OR (patch ? 'title' AND nullif(btrim(patch->>'title'),'') IS NULL)
   OR (patch ? 'priority' AND coalesce(patch->>'priority','') NOT IN ('Normal','High','Urgent'))
   OR (patch ? 'status' AND coalesce(patch->>'status','') NOT IN ('Pending','In Progress','Completed'))
   OR ((patch ? 'status') <> (patch ? 'completed_at'))
   OR (patch ? 'status' AND ((patch->>'status'='Completed') <> (patch->>'completed_at' IS NOT NULL)))
   THEN RAISE check_violation USING MESSAGE='Invalid task details or status'; END IF;
  IF verb='create' THEN patch:=patch||jsonb_build_object('created_by',actor); END IF;
 ELSIF kind='app_task_comments' THEN
  IF nullif(btrim(patch->>'body'),'') IS NULL OR length(patch->>'body')>12000
   THEN RAISE check_violation USING MESSAGE='Invalid comment'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.app_tasks t WHERE t.id=(patch->>'task_id')::uuid FOR SHARE)
   THEN RAISE foreign_key_violation USING MESSAGE='Task unavailable'; END IF;
  patch:=patch||jsonb_build_object('user_id',actor);
 ELSIF kind='library_items' THEN
  IF verb='update' THEN patch:=patch||jsonb_build_object('updated_at',now()); END IF;
 ELSIF kind='size_group_templates' THEN
  IF patch ? 'sizes' AND (jsonb_typeof(patch->'sizes')<>'array' OR jsonb_array_length(patch->'sizes')=0
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(patch->'sizes') value WHERE jsonb_typeof(value)<>'string'))
   THEN RAISE check_violation USING MESSAGE='Invalid sizes'; END IF;
  IF patch ?| ARRAY['sizes','base_size'] AND coalesce(patch->>'base_size',current_row->>'base_size') IS NOT NULL
   AND NOT coalesce(patch->'sizes',current_row->'sizes') ? coalesce(patch->>'base_size',current_row->>'base_size')
   THEN RAISE check_violation USING MESSAGE='Base size must be in template'; END IF;
 ELSE
  next_items:=patch->'members';
  IF coalesce(jsonb_typeof(next_items),'')<>'array' OR jsonb_array_length(next_items) NOT BETWEEN 1 AND 500
   OR (SELECT count(DISTINCT m->>'library_item_id') FROM jsonb_array_elements(next_items) m)<>jsonb_array_length(next_items)
   OR (SELECT count(DISTINCT m->>'id') FROM jsonb_array_elements(next_items) m)<>jsonb_array_length(next_items)
   OR nullif(btrim(patch->>'name'),'') IS NULL OR patch->>'buyer_id' IS NULL
   THEN RAISE check_violation USING MESSAGE='Invalid trim package'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(next_items) m
   WHERE NOT EXISTS(SELECT 1 FROM public.library_items i WHERE i.id=(m->>'library_item_id')::uuid
    AND i.category IN ('Stitching Trim','Packing Trim') AND (i.is_active OR EXISTS(
     SELECT 1 FROM public.bom_preset_items existing WHERE existing.preset_id=target AND existing.id=(m->>'id')::uuid
      AND existing.library_item_id=i.id))))
   THEN RAISE foreign_key_violation USING MESSAGE='Selected trim unavailable'; END IF;
  patch:=patch-'members';
 END IF;

 IF verb='create' THEN patch:=patch||jsonb_build_object('id',target); END IF;
 SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('r.%I',k),',' ORDER BY k)
 INTO columns_sql,values_sql FROM jsonb_object_keys(patch) k;
 IF verb='create' THEN
  EXECUTE format('INSERT INTO public.%I(%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) r',
    kind,columns_sql,values_sql,kind) USING patch;
 ELSE
  EXECUTE format('UPDATE public.%I SET (%s)=(SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) r) WHERE id=$2',
    kind,columns_sql,values_sql,kind) USING patch,target;
 END IF;
 IF kind='bom_presets' THEN
  DELETE FROM public.bom_preset_items i WHERE i.preset_id=target AND NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(next_items) m WHERE (m->>'id')::uuid=i.id AND (m->>'library_item_id')::uuid=i.library_item_id);
  INSERT INTO public.bom_preset_items(id,preset_id,library_item_id)
   SELECT (m->>'id')::uuid,target,(m->>'library_item_id')::uuid FROM jsonb_array_elements(next_items) m
   WHERE NOT EXISTS(SELECT 1 FROM public.bom_preset_items i WHERE i.preset_id=target AND i.id=(m->>'id')::uuid);
 END IF;
 RETURN 'applied';
EXCEPTION WHEN foreign_key_violation OR unique_violation THEN RETURN 'conflict';
 WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR check_violation OR not_null_violation
  OR numeric_value_out_of_range OR invalid_parameter_value THEN RETURN 'invalid';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_change_tasks_library(uuid,uuid,text,uuid,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_change_tasks_library(uuid,uuid,text,uuid,text,jsonb,jsonb) TO service_role;
