CREATE OR REPLACE FUNCTION public.desktop_apply_bulk_bom(
 actor uuid, operation uuid, target_order uuid, expected jsonb, patch jsonb
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.bom_receipts%ROWTYPE;
 current_order public.orders%ROWTYPE;
 original jsonb;
 current_groups jsonb;
 current_colors jsonb;
 current_breakdown jsonb;
BEGIN
 IF actor IS NULL OR operation IS NULL OR target_order IS NULL
   OR coalesce(jsonb_typeof(expected->'lines'),'')<>'array'
   OR coalesce(jsonb_typeof(expected->'groups'),'')<>'array'
   OR coalesce(jsonb_typeof(expected->'colors'),'')<>'array'
   OR coalesce(jsonb_typeof(expected->'breakdown'),'')<>'array'
   OR NOT (expected ?& ARRAY['step_bom','total_qty'])
   OR coalesce(jsonb_typeof(patch->'updates'),'')<>'array'
   OR coalesce(jsonb_typeof(patch->'inserts'),'')<>'array'
   OR coalesce(jsonb_typeof(patch->'removals'),'array') <> 'array'
   OR jsonb_array_length(patch->'updates') + jsonb_array_length(patch->'inserts')
      + coalesce(jsonb_array_length(patch->'removals'),0) NOT BETWEEN 1 AND 300
 THEN RETURN 'invalid'; END IF;

 IF NOT EXISTS (SELECT FROM public.users u
   WHERE u.id=actor AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE AND u.deleted_at IS NULL
   AND (u.role='admin' OR (desktop_private.team_permission(actor,'orders','edit') AND EXISTS (
     SELECT FROM public.permissions p WHERE p.role_id=u.role_id AND p.module='library' AND p.can_view
   ))) FOR SHARE)
 THEN RETURN 'unauthorized'; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-bom:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.bom_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
   IF prior.actor_id=actor AND prior.order_id=target_order AND prior.expected=expected AND prior.lines=patch
   THEN RETURN 'already-applied'; END IF;
   RETURN 'conflict';
 END IF;

 -- Match the hosted Bulk BOM lock order and hold matrix and BOM rows stable
 -- until the reviewed additions and overwrites are committed.
 LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE public.size_groups,public.size_group_colors,public.size_group_breakdown IN SHARE MODE;
 LOCK TABLE public.bom_items IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO current_order FROM public.orders o WHERE o.id=target_order;
 IF NOT FOUND OR current_order.step_bom IS DISTINCT FROM (expected->>'step_bom')::boolean
   OR current_order.total_qty IS DISTINCT FROM (expected->>'total_qty')::numeric
 THEN RETURN 'conflict'; END IF;
 SELECT coalesce(jsonb_agg(CASE WHEN b.bulk_instance_id IS NULL THEN to_jsonb(b)-'bulk_instance_id' ELSE to_jsonb(b) END ORDER BY b.id),'[]') INTO original
 FROM public.bom_items b WHERE b.order_id=target_order;
 SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.id),'[]') INTO current_groups
 FROM public.size_groups g WHERE g.order_id=target_order;
 SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]') INTO current_colors
 FROM public.size_group_colors c JOIN public.size_groups g ON g.id=c.size_group_id WHERE g.order_id=target_order;
 SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.id),'[]') INTO current_breakdown
 FROM public.size_group_breakdown b JOIN public.size_groups g ON g.id=b.size_group_id WHERE g.order_id=target_order;
 IF original IS DISTINCT FROM (SELECT coalesce(jsonb_agg(CASE WHEN row->>'bulk_instance_id' IS NULL THEN row-'bulk_instance_id' ELSE row END ORDER BY row->>'id'),'[]') FROM jsonb_array_elements(expected->'lines') row)
   OR current_groups IS DISTINCT FROM (SELECT coalesce(jsonb_agg(row ORDER BY row->>'id'),'[]') FROM jsonb_array_elements(expected->'groups') row)
   OR current_colors IS DISTINCT FROM (SELECT coalesce(jsonb_agg(row ORDER BY row->>'id'),'[]') FROM jsonb_array_elements(expected->'colors') row)
   OR current_breakdown IS DISTINCT FROM (SELECT coalesce(jsonb_agg(row ORDER BY row->>'id'),'[]') FROM jsonb_array_elements(expected->'breakdown') row)
 THEN RETURN 'conflict'; END IF;

 IF EXISTS (SELECT FROM jsonb_array_elements_text(coalesce(patch->'removals','[]')) AS remove(id)
   WHERE NOT EXISTS (SELECT FROM public.bom_items old WHERE old.id=remove.id::uuid AND old.order_id=target_order)
     OR EXISTS (SELECT FROM jsonb_array_elements(patch->'updates') b WHERE b->>'id'=remove.id))
   OR EXISTS (SELECT FROM jsonb_populate_recordset(NULL::public.bom_items,patch->'updates') b
   LEFT JOIN public.bom_items old ON old.id=b.id AND old.order_id=target_order
   WHERE old.id IS NULL OR old.use_cutting_qty IS TRUE OR b.order_id IS DISTINCT FROM target_order)
   OR EXISTS (SELECT FROM jsonb_populate_recordset(NULL::public.bom_items,(patch->'updates')||(patch->'inserts')) b
   WHERE b.id IS NULL OR b.wastage IS NULL OR b.wastage<0 OR b.final_qty<0
     OR b.usage_rule IS NULL OR b.usage_rule NOT IN ('Generic','By Color','By Size Group','By Individual Sizes','Configure Own','By Batch'))
   OR EXISTS (SELECT FROM jsonb_array_elements((patch->'updates')||(patch->'inserts')) b GROUP BY b->>'id' HAVING count(*)>1)
   OR EXISTS (SELECT FROM jsonb_populate_recordset(NULL::public.bom_items,patch->'inserts') b
     LEFT JOIN public.library_items lib ON lib.id=b.library_item_id
     WHERE b.order_id IS DISTINCT FROM target_order OR lib.id IS NULL OR b.name IS DISTINCT FROM lib.name
       OR b.category IS DISTINCT FROM lib.category OR b.category NOT IN ('Fabric','Stitching Trim','Packing Trim')
       OR EXISTS (SELECT FROM public.bom_items old WHERE old.order_id=target_order AND old.bulk_instance_id IS NOT DISTINCT FROM b.bulk_instance_id AND
         (old.library_item_id=b.library_item_id OR (old.library_item_id IS NULL AND old.category=b.category AND lower(trim(old.name))=lower(trim(b.name))))))
 THEN RETURN 'invalid'; END IF;

 DELETE FROM public.bom_items WHERE order_id=target_order
   AND id IN (SELECT value::uuid FROM jsonb_array_elements_text(coalesce(patch->'removals','[]')));
 UPDATE public.bom_items old SET detail=b.detail,specification=b.specification,unit=b.unit,
   usage_rule=b.usage_rule,usage_data=b.usage_data,base_qty=b.base_qty,final_qty=b.final_qty,wastage=b.wastage
 FROM jsonb_populate_recordset(NULL::public.bom_items,patch->'updates') b
 WHERE old.id=b.id AND old.order_id=target_order;
 INSERT INTO public.bom_items(id,order_id,bulk_instance_id,library_item_id,name,category,detail,specification,unit,usage_rule,usage_data,
   base_qty,final_qty,wastage,sort_order,use_cutting_qty)
 SELECT b.id,target_order,b.bulk_instance_id,b.library_item_id,b.name,b.category,b.detail,b.specification,b.unit,b.usage_rule,b.usage_data,
   b.base_qty,b.final_qty,b.wastage,b.sort_order,false
 FROM jsonb_populate_recordset(NULL::public.bom_items,patch->'inserts') b;
 UPDATE public.orders SET step_bom=true WHERE id=target_order;
 INSERT INTO desktop_private.bom_receipts VALUES(operation,actor,target_order,expected,patch);
 RETURN 'applied';
EXCEPTION WHEN foreign_key_violation OR unique_violation THEN RETURN 'conflict';
 WHEN invalid_text_representation OR check_violation OR not_null_violation OR numeric_value_out_of_range THEN RETURN 'invalid';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_apply_bulk_bom(uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_apply_bulk_bom(uuid,uuid,uuid,jsonb,jsonb) TO service_role;
