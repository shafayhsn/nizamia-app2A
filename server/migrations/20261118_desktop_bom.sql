CREATE TABLE IF NOT EXISTS desktop_private.bom_receipts (
 operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, order_id uuid NOT NULL, expected jsonb NOT NULL, lines jsonb NOT NULL
);
REVOKE ALL ON desktop_private.bom_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.bom_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_save_bom(actor uuid,operation uuid,target_order uuid,expected jsonb,lines jsonb)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE prior desktop_private.bom_receipts%ROWTYPE; original jsonb; prior_step boolean;
BEGIN
 IF actor IS NULL OR operation IS NULL OR target_order IS NULL
    OR coalesce(jsonb_typeof(expected->'lines'),'')<>'array' OR NOT expected ? 'step_bom'
    OR coalesce(jsonb_typeof(lines),'')<>'array' OR jsonb_array_length(lines)>300
 THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin'
    AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE)
 THEN RETURN 'unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-bom:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.bom_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.order_id=target_order AND prior.expected=expected AND prior.lines=lines THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 SELECT o.step_bom INTO prior_step FROM public.orders o WHERE o.id=target_order FOR UPDATE;
 IF NOT FOUND OR prior_step IS DISTINCT FROM (expected->>'step_bom')::boolean THEN RETURN 'conflict'; END IF;
 PERFORM 1 FROM public.bom_items b WHERE b.order_id=target_order FOR UPDATE;
 SELECT coalesce(jsonb_agg(to_jsonb(b)),'[]') INTO original FROM public.bom_items b WHERE b.order_id=target_order;
 IF jsonb_array_length(original)<>jsonb_array_length(expected->'lines')
  OR NOT (original @> (expected->'lines') AND original <@ (expected->'lines')) THEN RETURN 'conflict'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_populate_recordset(NULL::public.bom_items,lines) b
   WHERE b.id IS NULL OR b.order_id IS DISTINCT FROM target_order OR nullif(btrim(b.name),'') IS NULL)
 THEN RETURN 'invalid'; END IF;
 DELETE FROM public.bom_items WHERE order_id=target_order;
 INSERT INTO public.bom_items(id,order_id,library_item_id,name,category,detail,specification,unit,supplier_id,usage_rule,usage_data,
  final_qty,base_qty,wastage,custom_usage,notes,sort_order,use_cutting_qty)
 SELECT b.id,target_order,b.library_item_id,b.name,b.category,b.detail,b.specification,b.unit,b.supplier_id,b.usage_rule,b.usage_data,
  b.final_qty,b.base_qty,b.wastage,b.custom_usage,b.notes,b.sort_order,b.use_cutting_qty
 FROM jsonb_populate_recordset(NULL::public.bom_items,lines) b;
 UPDATE public.orders SET step_bom=true WHERE id=target_order;
 INSERT INTO desktop_private.bom_receipts VALUES(operation,actor,target_order,expected,lines);
 RETURN 'applied';
EXCEPTION WHEN foreign_key_violation OR unique_violation THEN RETURN 'conflict';
 WHEN invalid_text_representation OR check_violation OR not_null_violation OR numeric_value_out_of_range THEN RETURN 'invalid';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_save_bom(uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_save_bom(uuid,uuid,uuid,jsonb,jsonb) TO service_role;
