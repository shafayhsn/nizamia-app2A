CREATE TABLE IF NOT EXISTS desktop_private.order_import_receipts (
 operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, rows jsonb NOT NULL
);
REVOKE ALL ON desktop_private.order_import_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.order_import_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_import_orders(actor uuid,operation uuid,rows jsonb)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE prior desktop_private.order_import_receipts%ROWTYPE;
BEGIN
 IF actor IS NULL OR operation IS NULL OR coalesce(jsonb_typeof(rows),'')<>'array'
  OR jsonb_array_length(rows) NOT BETWEEN 1 AND 500 THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin'
  AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE) THEN RETURN 'unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-order-import:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.order_import_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.rows=rows THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_populate_recordset(NULL::public.orders,rows) o
  WHERE o.id IS NULL OR nullif(btrim(o.style_number),'') IS NULL OR nullif(btrim(o.buyer_name),'') IS NULL
   OR o.status IS DISTINCT FROM 'Draft') THEN RETURN 'invalid'; END IF;
 INSERT INTO public.orders(id,buyer_id,buyer_name,style_number,brand_name,store_name,po_number,factory_ref,
  description,currency,ship_mode,incoterms,port_of_loading,port_of_discharge,ship_date,in_store_date,merchandiser_name,agent_name,notes,status)
 SELECT o.id,o.buyer_id,o.buyer_name,o.style_number,o.brand_name,o.store_name,o.po_number,o.factory_ref,
  o.description,o.currency,o.ship_mode,o.incoterms,o.port_of_loading,o.port_of_discharge,o.ship_date,o.in_store_date,
  o.merchandiser_name,o.agent_name,o.notes,'Draft'
 FROM jsonb_populate_recordset(NULL::public.orders,rows) o;
 INSERT INTO desktop_private.order_import_receipts VALUES(operation,actor,rows);
 RETURN 'applied';
EXCEPTION WHEN foreign_key_violation OR unique_violation THEN RETURN 'conflict';
 WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR check_violation OR not_null_violation
 THEN RETURN 'invalid';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_import_orders(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_import_orders(uuid,uuid,jsonb) TO service_role;
