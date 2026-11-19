CREATE TABLE IF NOT EXISTS desktop_private.order_details_receipts (
 operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, order_id uuid NOT NULL,
 previous_fields jsonb NOT NULL, new_fields jsonb NOT NULL
);
REVOKE ALL ON desktop_private.order_details_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.order_details_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_update_order_details(
 actor uuid, operation uuid, target_order uuid, previous_fields jsonb, new_fields jsonb
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.order_details_receipts%ROWTYPE;
 next_order public.orders%ROWTYPE;
BEGIN
 IF actor IS NULL OR operation IS NULL OR target_order IS NULL
    OR coalesce(jsonb_typeof(new_fields),'')<>'object'
    OR coalesce(jsonb_typeof(previous_fields),'')<>'object'
    OR new_fields='{}'::jsonb
    OR EXISTS(SELECT 1 FROM jsonb_each(new_fields) f WHERE
     f.key NOT IN ('ship_date','po_date','merchandiser_name','store_name','status')
     OR NOT previous_fields ? f.key OR jsonb_typeof(f.value) NOT IN ('string','null'))
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(previous_fields) k WHERE NOT new_fields ? k)
    OR (new_fields->>'status' IS NOT NULL AND new_fields->>'status' NOT IN
        ('Draft','Active','Booked','Shipped','Cancelled'))
 THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin'
    AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE)
 THEN RETURN 'unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-order-details:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.order_details_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.order_id=target_order AND prior.previous_fields=previous_fields
     AND prior.new_fields=new_fields THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 next_order:=jsonb_populate_record(NULL::public.orders,new_fields);
 UPDATE public.orders o SET
  ship_date=CASE WHEN new_fields ? 'ship_date' THEN next_order.ship_date ELSE o.ship_date END,
  po_date=CASE WHEN new_fields ? 'po_date' THEN next_order.po_date ELSE o.po_date END,
  merchandiser_name=CASE WHEN new_fields ? 'merchandiser_name' THEN next_order.merchandiser_name ELSE o.merchandiser_name END,
  store_name=CASE WHEN new_fields ? 'store_name' THEN next_order.store_name ELSE o.store_name END,
  status=CASE WHEN new_fields ? 'status' THEN next_order.status ELSE o.status END,
  updated_at=now()
 WHERE o.id=target_order AND to_jsonb(o) @> previous_fields;
 IF NOT FOUND THEN RETURN 'conflict'; END IF;
 INSERT INTO desktop_private.order_details_receipts VALUES(operation,actor,target_order,previous_fields,new_fields);
 RETURN 'applied';
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow
 OR check_violation OR not_null_violation THEN RETURN 'invalid';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_update_order_details(uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_update_order_details(uuid,uuid,uuid,jsonb,jsonb) TO service_role;
