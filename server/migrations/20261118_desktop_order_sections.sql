CREATE TABLE IF NOT EXISTS desktop_private.order_section_receipts (
 operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, order_id uuid NOT NULL, section text NOT NULL,
 patch jsonb NOT NULL, expected jsonb NOT NULL, lines jsonb NOT NULL
);
REVOKE ALL ON desktop_private.order_section_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.order_section_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_save_order_section(
 actor uuid, operation uuid, target_order uuid, section text, patch jsonb, expected jsonb, lines jsonb
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.order_section_receipts%ROWTYPE;
 flag text;
 allowed text[];
 current_order jsonb;
 original jsonb;
 item jsonb;
 columns text;
 values_sql text;
BEGIN
 CASE section
 WHEN 'washing' THEN flag:='step_washing'; allowed:=ARRAY['id','order_id','color_id','color_name','wash_type','wash_ref',
  'wash_image_url','recipe','wash_image_base64','applies_to','usage_rule','usage_data'];
 WHEN 'embellishments' THEN flag:='step_embellishment'; allowed:=ARRAY['id','order_id','description','technique','placement','dimensions',
  'artwork_ref','artwork_url','colors_used','applies_to','qty','vendor_id','approval_status','notes','unit','rate','currency','usage_rule','usage_data'];
 WHEN 'order_processes' THEN flag:='step_processes'; allowed:=ARRAY['id','order_id','process_name','is_custom','sort_order'];
 ELSE RETURN 'invalid';
 END CASE;
 IF actor IS NULL OR operation IS NULL OR target_order IS NULL
    OR coalesce(jsonb_typeof(patch->flag),'')<>'boolean' OR NOT expected ? flag
    OR coalesce(jsonb_typeof(expected->'lines'),'')<>'array'
    OR coalesce(jsonb_typeof(lines),'')<>'array' OR jsonb_array_length(lines)>300
    OR (section='order_processes' AND (patch->flag<>'true'::jsonb OR coalesce(jsonb_typeof(patch->'notes'),'')<>'string'
     OR NOT expected ? 'notes' OR patch-ARRAY[flag,'notes']<>'{}'::jsonb))
    OR (section<>'order_processes' AND patch-flag<>'{}'::jsonb)
    OR (patch->flag='false'::jsonb AND jsonb_array_length(lines)>0)
 THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin'
    AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE) THEN RETURN 'unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-order-section:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.order_section_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.order_id=target_order AND prior.section=section AND prior.patch=patch
     AND prior.expected=expected AND prior.lines=lines THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 SELECT to_jsonb(o) INTO current_order FROM public.orders o WHERE o.id=target_order FOR UPDATE;
 IF NOT FOUND OR NOT current_order @> (expected-'lines') THEN RETURN 'conflict'; END IF;
 EXECUTE format('SELECT 1 FROM public.%I WHERE order_id=$1 FOR UPDATE',section) USING target_order;
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t)),''[]'') FROM public.%I t WHERE order_id=$1',section)
  INTO original USING target_order;
 IF jsonb_array_length(original)<>jsonb_array_length(expected->'lines')
   OR NOT (original @> (expected->'lines') AND original <@ (expected->'lines')) THEN RETURN 'conflict'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(lines) LOOP
  IF jsonb_typeof(item)<>'object' OR (item->>'order_id')::uuid IS DISTINCT FROM target_order OR item->>'id' IS NULL
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE NOT k=ANY(allowed)) THEN RETURN 'invalid'; END IF;
  IF section='washing' AND item->>'color_id' IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.size_group_colors c JOIN public.size_groups g ON g.id=c.size_group_id
   WHERE c.id=(item->>'color_id')::uuid AND g.order_id=target_order FOR SHARE OF g,c) THEN RETURN 'conflict'; END IF;
 END LOOP;
 EXECUTE format('DELETE FROM public.%I WHERE order_id=$1',section) USING target_order;
 FOR item IN SELECT value FROM jsonb_array_elements(lines) LOOP
  SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('r.%I',k),',' ORDER BY k)
   INTO columns,values_sql FROM jsonb_object_keys(item) k;
  EXECUTE format('INSERT INTO public.%I(%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) r',
   section,columns,values_sql,section) USING item;
 END LOOP;
 EXECUTE format('UPDATE public.orders SET %I=$1 WHERE id=$2',flag) USING (patch->>flag)::boolean,target_order;
 IF section='order_processes' THEN UPDATE public.orders SET notes=patch->>'notes' WHERE id=target_order; END IF;
 INSERT INTO desktop_private.order_section_receipts VALUES(operation,actor,target_order,section,patch,expected,lines);
 RETURN 'applied';
EXCEPTION WHEN foreign_key_violation OR unique_violation THEN RETURN 'conflict';
 WHEN invalid_text_representation OR check_violation OR not_null_violation OR numeric_value_out_of_range THEN RETURN 'invalid';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_save_order_section(uuid,uuid,uuid,text,jsonb,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_save_order_section(uuid,uuid,uuid,text,jsonb,jsonb,jsonb) TO service_role;
