CREATE SCHEMA IF NOT EXISTS desktop_private;
REVOKE ALL ON SCHEMA desktop_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA desktop_private TO service_role;
CREATE TABLE IF NOT EXISTS desktop_private.operational_receipts (
 operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, kind text NOT NULL, verb text NOT NULL,
 target uuid NOT NULL, payload jsonb NOT NULL, expected jsonb NOT NULL
);
REVOKE ALL ON desktop_private.operational_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.operational_receipts TO service_role;
CREATE OR REPLACE FUNCTION public.desktop_save_operational_record(actor uuid, operation uuid, kind text, verb text, target uuid, payload jsonb, expected jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
 receipt desktop_private.operational_receipts%ROWTYPE;
 header_table text;
 line_table text;
 parent_key text;
 allowed text[];
 header jsonb;
 old_header jsonb;
 old_lines jsonb;
 old_allocations jsonb;
 next_lines jsonb;
 allocations jsonb;
 mode text;
 column_name text;
 columns_sql text;
 values_sql text;
 row_item jsonb;
 reference_key uuid;
 seen_qty numeric;
 changed_order uuid;
 changed_queue uuid;
 qty_limit numeric;
 previous_batch uuid;
 selected_batch uuid;
 pay public.payment_settlements%ROWTYPE;
 existing_pay public.payment_settlements%ROWTYPE;
BEGIN
 IF actor IS NULL OR operation IS NULL OR target IS NULL OR coalesce(verb,'') NOT IN ('save','delete')
  OR coalesce(kind,'') NOT IN ('booking','shipment','settlement','batch')
  OR coalesce(jsonb_typeof(payload),'')<>'object' OR coalesce(jsonb_typeof(expected),'')<>'object' THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin' AND u.is_active IS TRUE
  AND u.is_restricted IS NOT TRUE FOR SHARE) THEN RETURN 'unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-operational:'||operation::text,0));
 SELECT * INTO receipt FROM desktop_private.operational_receipts p WHERE p.operation_id=operation;
 IF FOUND THEN
  IF receipt.actor_id=actor AND receipt.kind=kind AND receipt.verb=verb AND receipt.target=target
   AND receipt.payload=payload AND receipt.expected=expected THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 INSERT INTO desktop_private.operational_receipts VALUES(operation,actor,kind,verb,target,payload,expected);

 IF kind='batch' THEN
  IF verb<>'save' OR coalesce(jsonb_typeof(payload->'orders'),'')<>'array'
   OR jsonb_array_length(payload->'orders') NOT BETWEEN 1 AND 200
   OR (SELECT count(DISTINCT item->>'order_id') FROM jsonb_array_elements(payload->'orders') item)<>jsonb_array_length(payload->'orders')
   THEN RAISE check_violation; END IF;
  selected_batch:=(payload->>'batchId')::uuid;
  IF payload->'batch'<>'null'::jsonb THEN
   IF selected_batch IS DISTINCT FROM target OR nullif(btrim(payload->'batch'->>'name'),'') IS NULL
    THEN RAISE check_violation; END IF;
   INSERT INTO public.production_batches(id,name) VALUES(target,btrim(payload->'batch'->>'name'));
  ELSIF selected_batch IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.production_batches b WHERE b.id=selected_batch FOR SHARE)
   THEN RAISE foreign_key_violation; END IF;
  FOR row_item IN SELECT value FROM jsonb_array_elements(payload->'orders') ORDER BY value->>'order_id' LOOP
   changed_order:=(row_item->>'order_id')::uuid;
   IF NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.id=changed_order FOR UPDATE) THEN RAISE foreign_key_violation; END IF;
   SELECT x.batch_id INTO previous_batch FROM public.production_batch_orders x WHERE x.order_id=changed_order FOR UPDATE;
   IF previous_batch IS DISTINCT FROM (row_item->>'previous')::uuid THEN RAISE foreign_key_violation; END IF;
   IF selected_batch IS NULL THEN
    DELETE FROM public.production_batch_orders WHERE order_id=changed_order;
   ELSIF previous_batch IS DISTINCT FROM selected_batch THEN
    INSERT INTO public.production_batch_orders(order_id,batch_id) VALUES(changed_order,selected_batch)
    ON CONFLICT(order_id) DO UPDATE SET batch_id=excluded.batch_id,assigned_at=now();
   END IF;
  END LOOP;
  RETURN 'applied';
 END IF;

 -- The quantities are shared by bookings, allocations and shipments. A brief
 -- lock on these tables serializes these checks with the existing web writes.
 LOCK TABLE public.shipping_bookings,public.shipping_booking_lines,public.shipments,public.shipment_lines,
  public.shipping_booking_shipments,public.payment_settlements IN SHARE ROW EXCLUSIVE MODE;

 IF kind='settlement' THEN
  IF verb<>'save' THEN RAISE check_violation; END IF;
  pay:=jsonb_populate_record(NULL::public.payment_settlements,payload->'payment');
  IF pay.id IS DISTINCT FROM target OR coalesce(jsonb_typeof(pay.payload),'')<>'object'
   OR NOT EXISTS(SELECT 1 FROM public.shipments s WHERE s.id=pay.shipment_id FOR UPDATE) THEN RAISE foreign_key_violation; END IF;
  IF (SELECT count(*) FROM public.payment_settlements p WHERE p.shipment_id=pay.shipment_id)>1 THEN RAISE foreign_key_violation; END IF;
  SELECT * INTO existing_pay FROM public.payment_settlements p WHERE p.shipment_id=pay.shipment_id FOR UPDATE;
  IF NOT FOUND THEN
   IF expected->'payment' IS DISTINCT FROM 'null'::jsonb THEN RAISE foreign_key_violation; END IF;
   INSERT INTO public.payment_settlements(id,shipment_id,payload,updated_at) VALUES(pay.id,pay.shipment_id,pay.payload,now());
   RETURN 'applied';
  END IF;
  IF jsonb_build_object('id',existing_pay.id,'shipment_id',existing_pay.shipment_id,'payload',existing_pay.payload)
    IS DISTINCT FROM expected->'payment'
   OR existing_pay.id IS DISTINCT FROM target
   OR existing_pay.updated_at IS DISTINCT FROM (expected->>'updated_at')::timestamptz THEN RAISE foreign_key_violation; END IF;
  UPDATE public.payment_settlements SET payload=pay.payload,updated_at=now() WHERE id=target;
  RETURN 'applied';
 END IF;

 IF kind='booking' THEN
  header_table:='shipping_bookings'; line_table:='shipping_booking_lines'; parent_key:='booking_id';
  allowed:=string_to_array('booking_no booking_date etd eta notes status',' ');
 ELSE
  header_table:='shipments'; line_table:='shipment_lines'; parent_key:='shipment_id';
  allowed:=string_to_array('shipment_no shipment_date container_no booking_ref gate_pass_no delivery_challan_no gd_no hbl_hawb_no fi_no lc_no tracking_url etd eta notes status',' ');
 END IF;
 EXECUTE format('SELECT to_jsonb(h) FROM public.%I h WHERE h.id=$1 FOR UPDATE',header_table) INTO old_header USING target;
 IF expected->'header'='null'::jsonb THEN
  IF old_header IS NOT NULL OR verb='delete' THEN RAISE foreign_key_violation; END IF;
 ELSIF coalesce(jsonb_typeof(expected->'header'),'')<>'object' OR old_header IS NULL OR EXISTS(
   SELECT 1 FROM jsonb_each(expected->'header') e WHERE old_header->e.key IS DISTINCT FROM e.value) THEN
  RAISE foreign_key_violation;
 END IF;
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),''[]'') FROM public.%I x WHERE %I=$1',line_table,parent_key)
  INTO old_lines USING target;
 IF old_lines IS DISTINCT FROM expected->'lines' THEN RAISE foreign_key_violation; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]') INTO old_allocations FROM public.shipping_booking_shipments a
  WHERE (kind='shipment' AND a.shipment_id=target) OR (kind='booking' AND EXISTS(
   SELECT 1 FROM public.shipping_booking_lines l WHERE l.id=a.booking_line_id AND l.booking_id=target));
 IF old_allocations IS DISTINCT FROM expected->'allocations' THEN RAISE foreign_key_violation; END IF;
 IF verb='delete' THEN
  IF kind='booking' AND old_allocations<>'[]'::jsonb THEN RAISE foreign_key_violation; END IF;
  IF kind='shipment' THEN
   IF (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') FROM public.payment_settlements p WHERE p.shipment_id=target)
    IS DISTINCT FROM expected->'payments' THEN RAISE foreign_key_violation; END IF;
   DELETE FROM public.payment_settlements WHERE shipment_id=target;
   DELETE FROM public.shipping_booking_shipments WHERE shipment_id=target;
  END IF;
  EXECUTE format('DELETE FROM public.%I WHERE %I=$1',line_table,parent_key) USING target;
  EXECUTE format('DELETE FROM public.%I WHERE id=$1',header_table) USING target;
  RETURN 'applied';
 END IF;
 header:=payload->'header';
 next_lines:=payload->'lines';
 allocations:=payload->'allocations';
 mode:=payload->>'mode';
 IF coalesce(jsonb_typeof(header),'')<>'object' OR coalesce(jsonb_typeof(next_lines),'')<>'array'
  OR jsonb_array_length(next_lines)>300 OR (jsonb_array_length(next_lines)=0 AND mode IS DISTINCT FROM 'historical')
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(header) k WHERE NOT k=ANY(allowed))
  OR (old_header IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_object_keys(header) k WHERE NOT (expected->'header') ? k))
  THEN RAISE check_violation; END IF;
 IF kind='booking' THEN
  IF mode IS DISTINCT FROM 'booking' OR nullif(btrim(header->>'booking_no'),'') IS NULL OR header->>'booking_date' IS NULL
   OR coalesce(header->>'status','') NOT IN ('Draft','Requested','Confirmed','Partially Shipped','Shipped','Cancelled')
   OR EXISTS(SELECT 1 FROM public.shipping_bookings b WHERE b.id<>target AND lower(btrim(b.booking_no))=lower(btrim(header->>'booking_no')))
   THEN RAISE check_violation; END IF;
 ELSE
  IF coalesce(mode,'') NOT IN ('booked','manual','queued','historical') OR nullif(btrim(header->>'shipment_no'),'') IS NULL
   OR header->>'shipment_date' IS NULL OR coalesce(header->>'status','') NOT IN ('Open','Closed','Cancelled')
   OR EXISTS(SELECT 1 FROM public.shipments s WHERE s.id<>target AND lower(btrim(s.shipment_no))=lower(btrim(header->>'shipment_no')))
   OR (mode='historical' AND (next_lines<>'[]'::jsonb OR old_lines<>'[]'::jsonb))
   OR (mode='booked' AND (old_header IS NOT NULL OR coalesce(jsonb_typeof(allocations),'')<>'array'
    OR jsonb_array_length(allocations)<>jsonb_array_length(next_lines)))
   THEN RAISE check_violation; END IF;
 END IF;

 IF (SELECT count(DISTINCT item->>'id') FROM jsonb_array_elements(next_lines) item)<>jsonb_array_length(next_lines)
  THEN RAISE check_violation; END IF;
 PERFORM o.id FROM public.orders o WHERE o.id IN(
  SELECT (l->>'order_id')::uuid FROM jsonb_array_elements(next_lines) l
 ) ORDER BY o.id FOR SHARE;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(next_lines) l
    WHERE NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.id=(l->>'order_id')::uuid)
    OR (l->>'queue_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.order_queues q
        WHERE q.id=(l->>'queue_id')::uuid AND q.order_id=(l->>'order_id')::uuid)))
  THEN RAISE foreign_key_violation; END IF;
 PERFORM q.id FROM public.order_queues q WHERE q.id IN(
  SELECT (l->>'queue_id')::uuid FROM jsonb_array_elements(next_lines) l
 ) ORDER BY q.id FOR UPDATE;

 IF old_header IS NULL THEN header:=header||jsonb_build_object('id',target); END IF;
 SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('p.%I',k),',' ORDER BY k)
  INTO columns_sql,values_sql FROM jsonb_object_keys(header) k;
 IF old_header IS NULL THEN
  EXECUTE format('INSERT INTO public.%I(%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) p',
   header_table,columns_sql,values_sql,header_table) USING header;
 ELSE
  EXECUTE format('UPDATE public.%I SET (%s)=(SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) p) WHERE id=$2',
   header_table,columns_sql,values_sql,header_table) USING header,target;
 END IF;

 IF kind='booking' THEN
  IF EXISTS(SELECT 1 FROM jsonb_populate_recordset(NULL::public.shipping_booking_lines,next_lines) l
    JOIN public.shipping_booking_lines prior ON prior.id=l.id
    WHERE prior.booking_id<>target OR prior.order_id IS DISTINCT FROM l.order_id OR prior.queue_id IS DISTINCT FROM l.queue_id)
   OR EXISTS(SELECT 1 FROM jsonb_populate_recordset(NULL::public.shipping_booking_lines,next_lines) l
       WHERE l.qty IS NULL OR l.qty<=0)
   OR (SELECT count(DISTINCT coalesce(l->>'queue_id',l->>'order_id')) FROM jsonb_array_elements(next_lines) l)<>jsonb_array_length(next_lines)
   THEN RAISE check_violation; END IF;
  IF EXISTS(SELECT 1 FROM public.shipping_booking_lines l JOIN public.shipping_booking_shipments a ON a.booking_line_id=l.id
    WHERE l.booking_id=target GROUP BY l.id HAVING (header->>'status'='Cancelled' OR sum(a.qty)>coalesce((
      SELECT (j->>'qty')::numeric FROM jsonb_array_elements(next_lines) j WHERE (j->>'id')::uuid=l.id),0)))
   THEN RAISE foreign_key_violation; END IF;
  DELETE FROM public.shipping_booking_lines l WHERE l.booking_id=target AND NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(next_lines) j WHERE (j->>'id')::uuid=l.id);
  INSERT INTO public.shipping_booking_lines(id,booking_id,order_id,queue_id,qty)
   SELECT l.id,target,l.order_id,l.queue_id,l.qty FROM jsonb_populate_recordset(NULL::public.shipping_booking_lines,next_lines) l
   ON CONFLICT(id) DO UPDATE SET qty=excluded.qty;
  IF header->>'status'<>'Cancelled' AND EXISTS(
   SELECT 1 FROM public.shipping_booking_lines l JOIN public.orders o ON o.id=l.order_id
    LEFT JOIN public.order_queues q ON q.id=l.queue_id WHERE l.booking_id=target AND
     (SELECT coalesce(sum(other.qty),0) FROM public.shipping_booking_lines other
       JOIN public.shipping_bookings b ON b.id=other.booking_id WHERE b.status IS DISTINCT FROM 'Cancelled'
        AND other.order_id=l.order_id AND other.queue_id IS NOT DISTINCT FROM l.queue_id)>coalesce(q.qty,o.total_qty,0))
   THEN RAISE foreign_key_violation; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM jsonb_populate_recordset(NULL::public.shipment_lines,next_lines) l
   WHERE l.shipped_qty IS NULL OR l.shipped_qty<=0 OR (mode='queued' AND l.queue_id IS NULL)
    OR (mode='manual' AND l.queue_id IS NOT NULL)) THEN RAISE check_violation; END IF;
  IF EXISTS(SELECT 1 FROM public.shipping_booking_shipments a JOIN public.shipping_booking_lines b ON b.id=a.booking_line_id
     WHERE a.shipment_id=target GROUP BY b.order_id,b.queue_id HAVING sum(a.qty)>coalesce((
      SELECT sum((l->>'shipped_qty')::numeric) FROM jsonb_array_elements(next_lines) l WHERE (l->>'order_id')::uuid=b.order_id
       AND (l->>'queue_id')::uuid IS NOT DISTINCT FROM b.queue_id),0)) THEN RAISE foreign_key_violation; END IF;
  DELETE FROM public.shipment_lines WHERE shipment_id=target;
  INSERT INTO public.shipment_lines(id,shipment_id,order_id,queue_id,shipped_qty)
   SELECT l.id,target,l.order_id,l.queue_id,l.shipped_qty FROM jsonb_populate_recordset(NULL::public.shipment_lines,next_lines) l;
  IF mode='booked' THEN
   IF EXISTS(SELECT 1 FROM jsonb_populate_recordset(NULL::public.shipping_booking_shipments,allocations) a
    LEFT JOIN public.shipping_booking_lines l ON l.id=a.booking_line_id
    LEFT JOIN public.shipping_bookings b ON b.id=l.booking_id
    WHERE l.id IS NULL OR b.status='Cancelled' OR a.qty IS NULL OR a.qty<=0 OR a.qty+coalesce((
     SELECT sum(prior.qty) FROM public.shipping_booking_shipments prior WHERE prior.booking_line_id=l.id),0)>l.qty)
    THEN RAISE foreign_key_violation; END IF;
   IF EXISTS(
    SELECT 1 FROM (
      SELECT l.order_id,l.queue_id,sum(l.shipped_qty) AS qty FROM public.shipment_lines l WHERE l.shipment_id=target GROUP BY 1,2
    ) ship FULL JOIN (
      SELECT l.order_id,l.queue_id,sum(a.qty) AS qty
      FROM jsonb_populate_recordset(NULL::public.shipping_booking_shipments,allocations) a
      JOIN public.shipping_booking_lines l ON l.id=a.booking_line_id GROUP BY 1,2
    ) booked ON booked.order_id=ship.order_id AND coalesce(booked.queue_id,booked.order_id)=coalesce(ship.queue_id,ship.order_id)
    WHERE ship.qty IS DISTINCT FROM booked.qty
   ) THEN RAISE foreign_key_violation; END IF;
   INSERT INTO public.shipping_booking_shipments(id,shipment_id,booking_line_id,qty)
    SELECT a.id,target,a.booking_line_id,a.qty FROM jsonb_populate_recordset(NULL::public.shipping_booking_shipments,allocations) a;
  END IF;

  FOR row_item IN SELECT value FROM jsonb_array_elements(next_lines) LOOP
   changed_queue:=(row_item->>'queue_id')::uuid;
   changed_order:=(row_item->>'order_id')::uuid;
   IF changed_queue IS NOT NULL THEN
    SELECT q.qty INTO qty_limit FROM public.order_queues q WHERE q.id=changed_queue;
    SELECT coalesce(sum(l.shipped_qty),0) INTO seen_qty FROM public.shipment_lines l WHERE l.queue_id=changed_queue;
   ELSE
    SELECT o.total_qty INTO qty_limit FROM public.orders o WHERE o.id=changed_order;
    SELECT coalesce(sum(l.shipped_qty),0) INTO seen_qty FROM public.shipment_lines l WHERE l.order_id=changed_order;
   END IF;
   IF seen_qty>coalesce(qty_limit,0) AND NOT (mode='queued' AND EXISTS(
    SELECT 1 FROM jsonb_array_elements(payload->'close') c WHERE (c->>'id')::uuid=changed_queue AND nullif(btrim(c->>'reason'),'') IS NOT NULL))
    THEN RAISE foreign_key_violation; END IF;
   IF mode<>'queued' AND (SELECT coalesce(sum(l.shipped_qty),0) FROM public.shipment_lines l WHERE l.order_id=changed_order)>
     (SELECT coalesce(o.total_qty,0) FROM public.orders o WHERE o.id=changed_order)
    THEN RAISE foreign_key_violation; END IF;
  END LOOP;

  IF coalesce(jsonb_typeof(payload->'close'),'')<>'array' THEN RAISE check_violation; END IF;
  FOR row_item IN SELECT value FROM jsonb_array_elements(payload->'close') LOOP
   reference_key:=(row_item->>'id')::uuid;
   IF mode<>'queued' OR NOT EXISTS(SELECT 1 FROM public.shipment_lines l WHERE l.shipment_id=target AND l.queue_id=reference_key)
    THEN RAISE check_violation; END IF;
   SELECT q.qty-(SELECT coalesce(sum(l.shipped_qty),0) FROM public.shipment_lines l WHERE l.queue_id=q.id)
    INTO qty_limit FROM public.order_queues q WHERE q.id=reference_key;
   IF qty_limit<>0 AND nullif(btrim(row_item->>'reason'),'') IS NULL THEN RAISE check_violation; END IF;
   UPDATE public.order_queues SET status='Completed' WHERE id=reference_key AND status IS NOT DISTINCT FROM row_item->>'previous';
   IF NOT FOUND THEN RAISE foreign_key_violation; END IF;
  END LOOP;
  IF payload ? 'payment' THEN
   pay:=jsonb_populate_record(NULL::public.payment_settlements,payload->'payment');
   IF mode<>'historical' OR old_header IS NOT NULL OR pay.shipment_id IS DISTINCT FROM target
    OR coalesce(jsonb_typeof(pay.payload),'')<>'object' THEN RAISE check_violation; END IF;
   INSERT INTO public.payment_settlements(id,shipment_id,payload,updated_at) VALUES(pay.id,target,pay.payload,now());
  END IF;
 END IF;
 RETURN 'applied';
EXCEPTION
 WHEN too_many_rows OR foreign_key_violation OR unique_violation THEN RETURN 'conflict';
 WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR check_violation
   OR not_null_violation OR numeric_value_out_of_range OR invalid_parameter_value THEN RETURN 'invalid';
END;
$function$;
REVOKE ALL ON FUNCTION public.desktop_save_operational_record(uuid,uuid,text,text,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_save_operational_record(uuid,uuid,text,text,uuid,jsonb,jsonb) TO service_role;
