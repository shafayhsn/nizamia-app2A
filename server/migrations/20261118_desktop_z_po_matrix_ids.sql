CREATE OR REPLACE FUNCTION public.desktop_save_po_matrix(
 actor uuid, operation uuid, target_order uuid, payload jsonb, expected jsonb
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.po_matrix_receipts%ROWTYPE;
 order_row public.orders%ROWTYPE;
 key text;
 actual jsonb;
 group_row jsonb;
 color_row jsonb;
 groups jsonb:='[]';
 colors jsonb;
 group_id uuid;
 color_id uuid;
BEGIN
 IF actor IS NULL OR operation IS NULL OR target_order IS NULL
    OR coalesce(jsonb_typeof(payload->'p_groups'),'')<>'array'
    OR jsonb_array_length(payload->'p_groups')>100
    OR (payload->>'p_order_id')::uuid IS DISTINCT FROM target_order
    OR coalesce(jsonb_typeof(expected->'summary'),'')<>'object'
    OR NOT ((expected->'summary') ?& ARRAY['step_po_matrix','total_qty','total_value_usd','excess_cutting_pct','queue_split_rule'])
 THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin'
    AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE)
 THEN RETURN 'unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-po-matrix:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.po_matrix_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.order_id=target_order AND prior.payload=payload AND prior.expected=expected
  THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 SELECT * INTO order_row FROM public.orders o WHERE o.id=target_order FOR UPDATE;
 IF NOT FOUND OR NOT to_jsonb(order_row) @> (expected->'summary') THEN RETURN 'conflict'; END IF;
 PERFORM 1 FROM public.size_groups g WHERE g.order_id=target_order FOR UPDATE;
 PERFORM 1 FROM public.size_group_colors c JOIN public.size_groups g ON g.id=c.size_group_id
  WHERE g.order_id=target_order FOR UPDATE OF c;
 PERFORM 1 FROM public.size_group_breakdown b JOIN public.size_groups g ON g.id=b.size_group_id
  WHERE g.order_id=target_order FOR UPDATE OF b;
 FOREACH key IN ARRAY ARRAY['size_groups','size_group_colors','size_group_breakdown'] LOOP
  IF coalesce(jsonb_typeof(expected->key),'')<>'array' THEN RETURN 'invalid'; END IF;
  IF key='size_groups' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(g)),'[]') INTO actual FROM public.size_groups g WHERE g.order_id=target_order;
  ELSIF key='size_group_colors' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') INTO actual FROM public.size_group_colors c
   JOIN public.size_groups g ON g.id=c.size_group_id WHERE g.order_id=target_order;
  ELSE
   SELECT coalesce(jsonb_agg(to_jsonb(b)),'[]') INTO actual FROM public.size_group_breakdown b
   JOIN public.size_groups g ON g.id=b.size_group_id WHERE g.order_id=target_order;
  END IF;
  IF jsonb_array_length(actual)<>jsonb_array_length(expected->key)
    OR NOT (actual @> (expected->key) AND actual <@ (expected->key)) THEN RETURN 'conflict'; END IF;
 END LOOP;
 -- Give new rows real IDs before the existing save so its removal checks can
 -- distinguish those rows from groups and colours omitted from the matrix.
 FOR group_row IN SELECT value FROM jsonb_array_elements(payload->'p_groups') LOOP
  group_id:=nullif(group_row->>'id','')::uuid;
  IF group_id IS NULL THEN
   INSERT INTO public.size_groups(id,order_id,group_name,unit_price,currency,sizes,base_size,sort_order)
   VALUES(coalesce((group_row->>'desktop_id')::uuid,gen_random_uuid()),target_order,group_row->>'group_name',coalesce((group_row->>'unit_price')::numeric,0),coalesce(group_row->>'currency','USD'),
     ARRAY(SELECT jsonb_array_elements_text(group_row->'sizes')),group_row->>'base_size',(group_row->>'sort_order')::integer)
   RETURNING id INTO group_id;
   group_row:=jsonb_set(jsonb_set(group_row,'{id}',to_jsonb(group_id)),'{unit_price}',to_jsonb(coalesce((group_row->>'unit_price')::numeric,0)));
  ELSIF NOT EXISTS(SELECT 1 FROM public.size_groups g WHERE g.id=group_id AND g.order_id=target_order) THEN
   RAISE EXCEPTION 'Size group belongs to a different order';
  END IF;
  colors:='[]';
  FOR color_row IN SELECT value FROM jsonb_array_elements(group_row->'colors') LOOP
   color_id:=nullif(color_row->>'id','')::uuid;
   IF color_id IS NULL THEN
    INSERT INTO public.size_group_colors(id,size_group_id,color_name,sort_order,ratio_override,ratio_locked)
    VALUES(coalesce((color_row->>'desktop_id')::uuid,gen_random_uuid()),group_id,color_row->>'color_name',(color_row->>'sort_order')::integer,color_row->'ratio_override',
     coalesce((color_row->>'ratio_locked')::boolean,false))
    RETURNING id INTO color_id;
    color_row:=jsonb_set(color_row,'{id}',to_jsonb(color_id));
   END IF;
   colors:=colors||jsonb_build_array(color_row);
  END LOOP;
  groups:=groups||jsonb_build_array(jsonb_set(group_row,'{colors}',colors));
 END LOOP;
 PERFORM public.save_po_matrix_atomic(target_order,groups,(payload->>'p_total_qty')::integer,
  (payload->>'p_total_value_usd')::numeric,(payload->>'p_excess_cutting_pct')::numeric,payload->>'p_queue_split_rule');
 INSERT INTO desktop_private.po_matrix_receipts VALUES(operation,actor,target_order,payload,expected);
 RETURN 'applied';
EXCEPTION WHEN foreign_key_violation OR unique_violation THEN RETURN 'conflict';
 WHEN raise_exception OR invalid_text_representation OR check_violation OR not_null_violation OR numeric_value_out_of_range
 THEN RETURN 'invalid';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_save_po_matrix(uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_save_po_matrix(uuid,uuid,uuid,jsonb,jsonb) TO service_role;
