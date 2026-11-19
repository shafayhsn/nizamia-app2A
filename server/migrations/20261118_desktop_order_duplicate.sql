CREATE TABLE IF NOT EXISTS desktop_private.order_duplicate_receipts (
 operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, order_id uuid NOT NULL, header jsonb NOT NULL, copied jsonb NOT NULL
);
REVOKE ALL ON desktop_private.order_duplicate_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.order_duplicate_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_duplicate_order(actor uuid,operation uuid,target_order uuid,header jsonb,copied jsonb)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE prior desktop_private.order_duplicate_receipts%ROWTYPE; result text;
BEGIN
 IF actor IS NULL OR operation IS NULL OR target_order IS NULL OR coalesce(jsonb_typeof(copied),'')<>'object'
  OR NOT copied ?& ARRAY['size_groups','size_group_colors','bom_items']
  OR EXISTS(SELECT 1 FROM jsonb_each(copied) k WHERE k.key NOT IN ('size_groups','size_group_colors','bom_items')
   OR jsonb_typeof(k.value)<>'array')
  OR header ? 'po_number' THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin'
    AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE) THEN RETURN 'unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-duplicate-order:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.order_duplicate_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.order_id=target_order AND prior.header=header AND prior.copied=copied
  THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 result:=public.desktop_create_order(actor,operation,target_order,header);
 IF result<>'applied' THEN RETURN CASE WHEN result='already-applied' THEN 'conflict' ELSE result END; END IF;
 INSERT INTO public.size_groups(id,order_id,group_name,unit_price,currency,sizes,base_size,sort_order)
 SELECT r.id,target_order,r.group_name,r.unit_price,r.currency,r.sizes,r.base_size,r.sort_order
 FROM jsonb_populate_recordset(NULL::public.size_groups,copied->'size_groups') r;
 IF EXISTS(SELECT 1 FROM jsonb_populate_recordset(NULL::public.size_group_colors,copied->'size_group_colors') r
   WHERE NOT EXISTS(SELECT 1 FROM public.size_groups g WHERE g.id=r.size_group_id AND g.order_id=target_order))
 THEN RAISE foreign_key_violation USING MESSAGE='Copied colour has an unrelated size group'; END IF;
 INSERT INTO public.size_group_colors(id,size_group_id,color_name,sort_order)
 SELECT r.id,r.size_group_id,r.color_name,r.sort_order FROM jsonb_populate_recordset(NULL::public.size_group_colors,copied->'size_group_colors') r;
 INSERT INTO public.bom_items(id,order_id,library_item_id,name,category,detail,specification,unit,supplier_id,usage_rule,
  usage_data,base_qty,wastage,notes,sort_order,use_cutting_qty)
 SELECT r.id,target_order,r.library_item_id,r.name,r.category,r.detail,r.specification,r.unit,r.supplier_id,r.usage_rule,
  r.usage_data,r.base_qty,r.wastage,r.notes,r.sort_order,r.use_cutting_qty
 FROM jsonb_populate_recordset(NULL::public.bom_items,copied->'bom_items') r;
 INSERT INTO desktop_private.order_duplicate_receipts VALUES(operation,actor,target_order,header,copied);
 RETURN 'applied';
EXCEPTION WHEN foreign_key_violation OR unique_violation THEN RETURN 'conflict';
 WHEN invalid_text_representation OR check_violation OR not_null_violation OR numeric_value_out_of_range THEN RETURN 'invalid';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_duplicate_order(uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_duplicate_order(uuid,uuid,uuid,jsonb,jsonb) TO service_role;
