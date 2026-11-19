CREATE TABLE IF NOT EXISTS desktop_private.order_create_receipts (
 operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, order_id uuid NOT NULL, header jsonb NOT NULL
);
REVOKE ALL ON desktop_private.order_create_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.order_create_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_create_order(actor uuid,operation uuid,target_order uuid,header jsonb)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE prior desktop_private.order_create_receipts%ROWTYPE; draft public.orders%ROWTYPE;
BEGIN
 IF actor IS NULL OR operation IS NULL OR target_order IS NULL OR coalesce(jsonb_typeof(header),'')<>'object'
  OR header->>'status' IS DISTINCT FROM 'Draft'
  OR EXISTS(SELECT 1 FROM jsonb_each(header) f WHERE f.key NOT IN
   ('buyer_id','buyer_name','merchandiser_name','agent_name','factory_ref','product_id','style_number','store_name','brand_name','description','po_number','po_date','ship_date','planned_date','ship_mode','incoterms','currency','status','port_of_loading','port_of_discharge','style_image_base64')
   OR jsonb_typeof(f.value) NOT IN ('string','null')) THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin'
  AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE) THEN RETURN 'unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-create-order:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.order_create_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.order_id=target_order AND prior.header=header THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 draft:=jsonb_populate_record(NULL::public.orders,header);
 IF nullif(btrim(draft.style_number),'') IS NULL OR draft.buyer_id IS NULL THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.buyers b WHERE b.id=draft.buyer_id FOR SHARE) THEN RETURN 'conflict'; END IF;
 INSERT INTO public.orders(id,buyer_id,buyer_name,merchandiser_name,agent_name,factory_ref,product_id,style_number,store_name,brand_name,description,po_number,po_date,ship_date,planned_date,ship_mode,incoterms,currency,status,port_of_loading,port_of_discharge,style_image_base64)
 VALUES(target_order,draft.buyer_id,draft.buyer_name,draft.merchandiser_name,draft.agent_name,draft.factory_ref,draft.product_id,draft.style_number,draft.store_name,draft.brand_name,draft.description,draft.po_number,draft.po_date,draft.ship_date,draft.planned_date,draft.ship_mode,draft.incoterms,draft.currency,draft.status,draft.port_of_loading,draft.port_of_discharge,draft.style_image_base64);
 INSERT INTO desktop_private.order_create_receipts VALUES(operation,actor,target_order,header);
 RETURN 'applied';
EXCEPTION WHEN foreign_key_violation OR unique_violation THEN RETURN 'conflict';
 WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR check_violation OR not_null_violation
 THEN RETURN 'invalid';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_create_order(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_create_order(uuid,uuid,uuid,jsonb) TO service_role;
