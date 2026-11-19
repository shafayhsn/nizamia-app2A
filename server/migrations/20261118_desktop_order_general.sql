CREATE TABLE IF NOT EXISTS desktop_private.order_general_receipts (
 operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, order_id uuid NOT NULL,
 previous_fields jsonb NOT NULL, new_fields jsonb NOT NULL
);
REVOKE ALL ON desktop_private.order_general_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.order_general_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_update_order_general(
 actor uuid, operation uuid, target_order uuid, previous_fields jsonb, new_fields jsonb
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.order_general_receipts%ROWTYPE;
 next_order public.orders%ROWTYPE;
BEGIN
 IF actor IS NULL OR operation IS NULL OR target_order IS NULL
    OR coalesce(jsonb_typeof(new_fields),'')<>'object'
    OR coalesce(jsonb_typeof(previous_fields),'')<>'object'
    OR new_fields='{}'::jsonb
    OR EXISTS(SELECT 1 FROM jsonb_each(new_fields) f WHERE
     f.key NOT IN ('buyer_id','buyer_name','merchandiser_name','agent_name','factory_ref','product_id','style_number','store_name','brand_name','description','po_number','po_date','ship_date','planned_date','ship_mode','incoterms','currency','status','port_of_loading','port_of_discharge','style_image_base64')
     OR NOT previous_fields ? f.key OR jsonb_typeof(f.value) NOT IN ('string','null'))
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(previous_fields) k WHERE NOT new_fields ? k)
 THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin'
    AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE)
 THEN RETURN 'unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-order-general:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.order_general_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.order_id=target_order AND prior.previous_fields=previous_fields
     AND prior.new_fields=new_fields THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 next_order:=jsonb_populate_record(NULL::public.orders,new_fields);
 IF (new_fields ? 'style_number' AND nullif(btrim(next_order.style_number),'') IS NULL)
  OR (new_fields ? 'buyer_id' AND (next_order.buyer_id IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.buyers b WHERE b.id=next_order.buyer_id FOR SHARE))) THEN RETURN 'invalid'; END IF;
 UPDATE public.orders o SET
  buyer_id=CASE WHEN new_fields ? 'buyer_id' THEN next_order.buyer_id ELSE o.buyer_id END,
  buyer_name=CASE WHEN new_fields ? 'buyer_name' THEN next_order.buyer_name ELSE o.buyer_name END,
  merchandiser_name=CASE WHEN new_fields ? 'merchandiser_name' THEN next_order.merchandiser_name ELSE o.merchandiser_name END,
  agent_name=CASE WHEN new_fields ? 'agent_name' THEN next_order.agent_name ELSE o.agent_name END,
  factory_ref=CASE WHEN new_fields ? 'factory_ref' THEN next_order.factory_ref ELSE o.factory_ref END,
  product_id=CASE WHEN new_fields ? 'product_id' THEN next_order.product_id ELSE o.product_id END,
  style_number=CASE WHEN new_fields ? 'style_number' THEN next_order.style_number ELSE o.style_number END,
  store_name=CASE WHEN new_fields ? 'store_name' THEN next_order.store_name ELSE o.store_name END,
  brand_name=CASE WHEN new_fields ? 'brand_name' THEN next_order.brand_name ELSE o.brand_name END,
  description=CASE WHEN new_fields ? 'description' THEN next_order.description ELSE o.description END,
  po_number=CASE WHEN new_fields ? 'po_number' THEN next_order.po_number ELSE o.po_number END,
  po_date=CASE WHEN new_fields ? 'po_date' THEN next_order.po_date ELSE o.po_date END,
  ship_date=CASE WHEN new_fields ? 'ship_date' THEN next_order.ship_date ELSE o.ship_date END,
  planned_date=CASE WHEN new_fields ? 'planned_date' THEN next_order.planned_date ELSE o.planned_date END,
  ship_mode=CASE WHEN new_fields ? 'ship_mode' THEN next_order.ship_mode ELSE o.ship_mode END,
  incoterms=CASE WHEN new_fields ? 'incoterms' THEN next_order.incoterms ELSE o.incoterms END,
  currency=CASE WHEN new_fields ? 'currency' THEN next_order.currency ELSE o.currency END,
  status=CASE WHEN new_fields ? 'status' THEN next_order.status ELSE o.status END,
  port_of_loading=CASE WHEN new_fields ? 'port_of_loading' THEN next_order.port_of_loading ELSE o.port_of_loading END,
  port_of_discharge=CASE WHEN new_fields ? 'port_of_discharge' THEN next_order.port_of_discharge ELSE o.port_of_discharge END,
  style_image_base64=CASE WHEN new_fields ? 'style_image_base64' THEN next_order.style_image_base64 ELSE o.style_image_base64 END,
  updated_at=now()
 WHERE o.id=target_order AND to_jsonb(o) @> previous_fields;
 IF NOT FOUND THEN RETURN 'conflict'; END IF;
 INSERT INTO desktop_private.order_general_receipts VALUES(operation,actor,target_order,previous_fields,new_fields);
 RETURN 'applied';
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow
 OR check_violation OR not_null_violation THEN RETURN 'invalid';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_update_order_general(uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_update_order_general(uuid,uuid,uuid,jsonb,jsonb) TO service_role;
