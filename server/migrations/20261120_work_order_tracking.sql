CREATE TABLE desktop_private.work_order_movements (
  id uuid PRIMARY KEY,
  line_id uuid NOT NULL REFERENCES public.work_order_items(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  moved_on date NOT NULL,
  movement text NOT NULL CHECK (movement IN ('dispatch','dispatchRework','accept','rework','reject')),
  reference text NOT NULL CHECK (char_length(reference) BETWEEN 1 AND 120),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 999999999),
  notes text NOT NULL CHECK (char_length(notes)<=500),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_order_movements_line ON desktop_private.work_order_movements(line_id,recorded_at,id);
REVOKE ALL ON desktop_private.work_order_movements FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON desktop_private.work_order_movements TO service_role;

CREATE FUNCTION desktop_private.work_order_balance(target uuid)
RETURNS TABLE(sent bigint, "out" bigint, accepted bigint, rework bigint, rejected bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT
    coalesce(sum(quantity) FILTER (WHERE movement='dispatch'),0),
    coalesce(sum(CASE WHEN movement IN ('dispatch','dispatchRework') THEN quantity ELSE -quantity END),0),
    coalesce(sum(quantity) FILTER (WHERE movement='accept'),0),
    coalesce(sum(CASE WHEN movement='rework' THEN quantity WHEN movement='dispatchRework' THEN -quantity END),0),
    coalesce(sum(quantity) FILTER (WHERE movement='reject'),0)
  FROM desktop_private.work_order_movements WHERE line_id=target
$$;
REVOKE ALL ON FUNCTION desktop_private.work_order_balance(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION desktop_private.work_order_balance(uuid) TO service_role;

CREATE FUNCTION public.read_work_order_tracking(actor uuid, query text, after_id uuid, target uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE writable boolean:=desktop_private.fulfillment_permission(actor,'production');
DECLARE result jsonb;
BEGIN
  IF target IS NOT NULL THEN
    SELECT jsonb_agg(to_jsonb(m)-'actor_id'||jsonb_build_object('recorded_by',u.username)
      ORDER BY m.recorded_at DESC,m.id DESC) INTO result
    FROM desktop_private.work_order_movements m LEFT JOIN public.users u ON u.id=m.actor_id
    WHERE m.line_id=target;
    RETURN jsonb_build_object('history',coalesce(result,'[]'::jsonb));
  END IF;
  WITH lines AS (
    SELECT i.id,i.process_name AS label,i.dept_info AS detail,i.qty AS ordered,i.unit,w.wo_number AS number,
      s.name AS partner,w.complete_by AS due,w.status,
      lower(w.status) IN ('issued','in progress') AND i.qty>0 AND i.qty=trunc(i.qty)
        AND lower(btrim(coalesce(i.unit,'pcs'))) IN ('','pc','pcs','piece','pieces') AS open
    FROM public.work_order_items i JOIN public.work_orders w ON w.id=i.wo_id
    LEFT JOIN public.suppliers s ON s.id=w.vendor_id
    WHERE (after_id IS NULL OR i.id>after_id)
      AND (coalesce(query,'')='' OR strpos(lower(concat_ws(' ',w.wo_number,i.process_name,s.name)),lower(query))>0)
      AND (lower(w.status) IN ('issued','in progress','completed') OR EXISTS (
        SELECT 1 FROM desktop_private.work_order_movements m WHERE m.line_id=i.id
      ))
    ORDER BY i.id LIMIT 51
  )
  SELECT jsonb_agg(to_jsonb(l)||(to_jsonb(b)-'sent')||jsonb_build_object('awaitingDispatch',l.ordered-b.sent) ORDER BY l.id)
    INTO result FROM lines l CROSS JOIN LATERAL desktop_private.work_order_balance(l.id) b;
  RETURN jsonb_build_object('can_post',writable,'rows',coalesce(result,'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.read_work_order_tracking(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_work_order_tracking(uuid,text,uuid,uuid) TO service_role;

CREATE FUNCTION public.post_work_order_movement(
  actor uuid, operation uuid, target uuid, event_date date, reference text,
  amount integer, movement text, memo text
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE parent_id uuid;
DECLARE status text;
DECLARE ordered numeric;
DECLARE unit text;
DECLARE balance record;
DECLARE prior desktop_private.work_order_movements%ROWTYPE;
BEGIN
  IF NOT desktop_private.fulfillment_permission(actor,'production') THEN RAISE insufficient_privilege; END IF;
  IF operation IS NULL OR target IS NULL OR event_date IS NULL OR event_date>(now() AT TIME ZONE 'Asia/Karachi')::date
    OR amount IS NULL OR amount NOT BETWEEN 1 AND 999999999 OR post_work_order_movement.movement IS NULL
    OR post_work_order_movement.movement NOT IN ('dispatch','dispatchRework','accept','rework','reject')
    OR nullif(btrim(reference),'') IS NULL THEN RAISE invalid_parameter_value; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('work-order-movement:'||operation::text,0));
  SELECT * INTO prior FROM desktop_private.work_order_movements m WHERE m.id=operation;
  IF FOUND THEN
    IF ROW(prior.actor_id,prior.line_id,prior.moved_on,prior.reference,prior.quantity,prior.movement,prior.notes)
      IS NOT DISTINCT FROM ROW(actor,target,event_date,btrim(reference),amount,post_work_order_movement.movement,btrim(coalesce(memo,'')))
    THEN RETURN 'already-applied'; END IF;
    RETURN 'conflict';
  END IF;

  -- Serialize postings for the same line before calculating its balance.
  SELECT i.wo_id INTO parent_id FROM public.work_order_items i WHERE i.id=target;
  SELECT w.status INTO status FROM public.work_orders w WHERE w.id=parent_id FOR SHARE;
  SELECT i.qty,i.unit INTO ordered,unit FROM public.work_order_items i WHERE i.id=target AND i.wo_id=parent_id FOR UPDATE;
  IF NOT FOUND OR status IS NULL OR lower(status) NOT IN ('issued','in progress') OR ordered IS NULL
    OR ordered<=0 OR ordered<>trunc(ordered) OR lower(btrim(coalesce(unit,'pcs'))) NOT IN ('','pc','pcs','piece','pieces')
    THEN RETURN 'conflict'; END IF;
  SELECT * INTO balance FROM desktop_private.work_order_balance(target);
  IF amount>(CASE post_work_order_movement.movement
    WHEN 'dispatch' THEN ordered-balance.sent
    WHEN 'dispatchRework' THEN balance.rework
    ELSE balance."out"
  END) THEN RETURN 'conflict'; END IF;

  INSERT INTO desktop_private.work_order_movements(id,line_id,actor_id,moved_on,movement,reference,quantity,notes)
    VALUES(operation,target,actor,event_date,post_work_order_movement.movement,btrim(reference),amount,btrim(coalesce(memo,'')));
  RETURN 'applied';
END $$;
REVOKE ALL ON FUNCTION public.post_work_order_movement(uuid,uuid,uuid,date,text,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.post_work_order_movement(uuid,uuid,uuid,date,text,integer,text,text) TO service_role;

-- Existing WO editors can change document status. Preserve the source quantity
-- and identity of any line that already has tracking history.
CREATE FUNCTION desktop_private.guard_tracked_work_order_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM desktop_private.work_order_movements m WHERE m.line_id=OLD.id)
  THEN
    RAISE check_violation USING MESSAGE='A work order line with posted movements cannot be changed.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION desktop_private.guard_tracked_work_order_line() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_tracked_work_order_line
  BEFORE UPDATE ON public.work_order_items FOR EACH ROW
  WHEN (ROW(OLD.id,OLD.wo_id,OLD.process_name,OLD.dept_info,OLD.qty,OLD.unit)
        IS DISTINCT FROM ROW(NEW.id,NEW.wo_id,NEW.process_name,NEW.dept_info,NEW.qty,NEW.unit))
  EXECUTE FUNCTION desktop_private.guard_tracked_work_order_line();

-- Keep a web edit atomic when replacing a line would remove its ledger reference.
CREATE FUNCTION public.edit_tracked_work_order(
  actor uuid, target uuid, expected_time timestamptz, header jsonb, lines jsonb
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE current_time_stamp timestamptz;
DECLARE updated public.work_orders%ROWTYPE;
BEGIN
  PERFORM desktop_private.fulfillment_permission(actor,'purchasing');
  IF NOT EXISTS (
    SELECT 1 FROM public.users u LEFT JOIN public.permissions p ON p.role_id=u.role_id AND p.module='purchasing'
    WHERE u.id=actor AND (u.role='admin' OR (p.can_edit AND (lines IS NULL OR (p.can_create AND p.can_delete))))
  ) THEN RAISE insufficient_privilege; END IF;
  IF coalesce(jsonb_typeof(header),'')<>'object' OR (
    lines IS NOT NULL AND (jsonb_typeof(lines)<>'array' OR jsonb_array_length(lines)>200)
  ) THEN RAISE invalid_parameter_value; END IF;

  SELECT w.updated_at INTO current_time_stamp FROM public.work_orders w WHERE w.id=target FOR UPDATE;
  IF NOT FOUND OR current_time_stamp IS DISTINCT FROM expected_time THEN RETURN 'conflict'; END IF;
  IF lines IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.work_order_items i JOIN desktop_private.work_order_movements m ON m.line_id=i.id
    WHERE i.wo_id=target
  ) THEN RETURN 'tracked'; END IF;

  updated:=jsonb_populate_record(NULL::public.work_orders,header);
  UPDATE public.work_orders SET order_id=updated.order_id,vendor_id=updated.vendor_id,vendor_type=updated.vendor_type,
    vendor_phone=updated.vendor_phone,factory_ref=updated.factory_ref,issue_date=updated.issue_date,
    start_date=updated.start_date,complete_by=updated.complete_by,daily_output=updated.daily_output,
    payment_terms=updated.payment_terms,color=updated.color,qty=updated.qty,status=updated.status,notes=updated.notes,
    updated_at=now() WHERE id=target;

  IF lines IS NOT NULL THEN
    DELETE FROM public.work_order_items WHERE wo_id=target;
    INSERT INTO public.work_order_items(wo_id,order_process_id,process_name,dept_info,qty,unit,rate,amount,sort_order)
      SELECT target,i.order_process_id,i.process_name,i.dept_info,i.qty,i.unit,i.rate,i.amount,i.sort_order
      FROM jsonb_populate_recordset(NULL::public.work_order_items,lines) i;
  END IF;
  RETURN 'applied';
END $$;
REVOKE ALL ON FUNCTION public.edit_tracked_work_order(uuid,uuid,timestamptz,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.edit_tracked_work_order(uuid,uuid,timestamptz,jsonb,jsonb) TO service_role;
