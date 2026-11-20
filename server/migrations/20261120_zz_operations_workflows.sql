CREATE OR REPLACE FUNCTION public.hr_attendance_action(actor uuid, command text, fields jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE account_role text;
DECLARE employee desktop_private.hr_employees%ROWTYPE;
DECLARE work_day date;
DECLARE arrived time;
DECLARE departed time;
DECLARE target uuid;
BEGIN
  SELECT lower(u.role) INTO account_role FROM public.users u
  WHERE u.id=actor AND u.is_active AND u.is_restricted IS NOT TRUE AND u.deleted_at IS NULL FOR SHARE;
  IF account_role IS NULL OR account_role NOT IN ('hr','admin') THEN RAISE insufficient_privilege; END IF;
  IF command='list' THEN
    work_day:=(fields->>'date')::date;
    RETURN jsonb_build_object(
      'employees',coalesce((SELECT jsonb_agg(to_jsonb(e)-'updated_by' ORDER BY e.name,e.employee_code)
        FROM desktop_private.hr_employees e WHERE e.archived_at IS NULL),'[]'::jsonb),
      'attendance',coalesce((SELECT jsonb_agg((to_jsonb(a)-'updated_by')||
        jsonb_build_object('name',e.name,'employee_code',e.employee_code,'archived',e.archived_at IS NOT NULL) ORDER BY e.name)
        FROM desktop_private.hr_attendance a JOIN desktop_private.hr_employees e ON e.id=a.employee_id
        WHERE a.work_date=work_day),'[]'::jsonb));
  END IF;
  target:=(fields->>'id')::uuid;
  IF command='saveEmployee' THEN
    employee:=jsonb_populate_record(NULL::desktop_private.hr_employees,fields);
    IF employee.employee_code IS NULL OR btrim(employee.employee_code)='' OR employee.name IS NULL OR btrim(employee.name)=''
       OR extract(second FROM employee.shift_start)<>0 OR extract(second FROM employee.shift_end)<>0
    THEN RAISE invalid_parameter_value; END IF;
    INSERT INTO desktop_private.hr_employees(id,employee_code,name,department,shift_start,shift_end,overtime_allowed,monthly_salary,updated_by)
    VALUES(target,upper(btrim(employee.employee_code)),btrim(employee.name),btrim(employee.department),
      employee.shift_start,employee.shift_end,employee.overtime_allowed,employee.monthly_salary,actor)
    ON CONFLICT(id) DO UPDATE SET employee_code=excluded.employee_code,name=excluded.name,department=excluded.department,
      shift_start=excluded.shift_start,shift_end=excluded.shift_end,overtime_allowed=excluded.overtime_allowed,
      monthly_salary=excluded.monthly_salary,updated_by=actor WHERE hr_employees.archived_at IS NULL;
  ELSIF command='archiveEmployee' THEN
    UPDATE desktop_private.hr_employees SET archived_at=coalesce(archived_at,now()),updated_by=actor WHERE id=target;
  ELSIF command='saveAttendance' THEN
    work_day:=(fields->>'date')::date;
    arrived:=(fields->>'clock_in')::time;
    departed:=nullif(fields->>'clock_out','')::time;
    IF work_day IS NULL OR work_day>(now() AT TIME ZONE 'Asia/Karachi')::date OR arrived IS NULL
      OR extract(second FROM arrived)<>0 OR extract(second FROM departed)<>0 THEN RAISE invalid_parameter_value; END IF;
    SELECT * INTO employee FROM desktop_private.hr_employees e WHERE e.id=target AND e.archived_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RETURN '{"result":"missing"}'::jsonb; END IF;
    INSERT INTO desktop_private.hr_attendance(employee_id,work_date,clock_in,clock_out,shift_start,shift_end,overtime_allowed,updated_by)
    VALUES(target,work_day,arrived,departed,employee.shift_start,employee.shift_end,employee.overtime_allowed,actor)
    ON CONFLICT(employee_id,work_date) DO UPDATE SET clock_in=excluded.clock_in,clock_out=excluded.clock_out,updated_by=actor;
  ELSE RAISE invalid_parameter_value;
  END IF;
  RETURN jsonb_build_object('result',CASE WHEN FOUND THEN 'saved' ELSE 'missing' END);
END $$;
REVOKE ALL ON FUNCTION public.hr_attendance_action(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_attendance_action(uuid,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.read_work_order_tracking(actor uuid, query text, after_id uuid, target uuid)
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
    SELECT i.id,w.id AS wo_id,i.process_name AS label,i.dept_info AS detail,i.qty AS ordered,i.unit,w.wo_number AS number,
      s.name AS partner,w.complete_by AS due,w.status,
      lower(w.status) IN ('issued','in progress') AND i.qty>0 AND i.qty=trunc(i.qty)
        AND lower(btrim(coalesce(i.unit,'pcs'))) IN ('','pc','pcs','piece','pieces') AS open
    FROM public.work_order_items i JOIN public.work_orders w ON w.id=i.wo_id
    LEFT JOIN public.suppliers s ON s.id=w.vendor_id
    WHERE (after_id IS NULL OR i.id>after_id)
      AND (coalesce(query,'')='' OR strpos(lower(concat_ws(' ',w.wo_number,i.process_name,s.name)),lower(query))>0)
      AND (lower(coalesce(w.status,'')) <> 'cancelled' OR EXISTS (
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


CREATE FUNCTION public.read_po_receiving(actor uuid, target uuid, after_id uuid, query text, start_date date, end_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE writable boolean:=desktop_private.fulfillment_permission(actor,'purchasing');
DECLARE result jsonb;
BEGIN
  WITH candidates AS MATERIALIZED (
    SELECT p.id,p.po_number,p.status,p.delivery_date,s.name AS supplier
    FROM public.purchase_orders p
    LEFT JOIN public.suppliers s ON s.id=p.supplier_id
    WHERE (target IS NULL OR p.id=target) AND (after_id IS NULL OR p.id>after_id)
    AND (target IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.purchase_order_items i JOIN desktop_private.store_receipts r ON r.line_id=i.id
      WHERE i.po_id=p.id AND (start_date IS NULL OR r.received_on>=start_date)
       AND (end_date IS NULL OR r.received_on<=end_date)
       AND (coalesce(query,'')='' OR strpos(lower(concat_ws(' ',p.po_number,s.name,i.description,r.delivery_ref,r.id)),lower(query))>0)
    ))
  ), visible AS MATERIALIZED (
    SELECT c.*, v.document->>'approval_verified'='true'
      AND lower(c.status) IN ('issued','acknowledged','delivered') AS open
    FROM candidates c CROSS JOIN LATERAL public.read_purchase_order_page(actor,NULL,c.id) v
    WHERE NOT (v.document->>'details_hidden')::boolean
    ORDER BY c.id LIMIT 51
  )
  SELECT jsonb_agg(to_jsonb(v)||jsonb_build_object('lines',coalesce(lines.items,'[]'::jsonb)) ORDER BY v.id)
  INTO result FROM visible v CROSS JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('id',i.id,'label',i.description,'unit',i.unit,'ordered',i.qty,
      'received',r.received,'balance',greatest(0,i.qty-r.received),'history',r.history) ORDER BY i.sort_order,i.id) AS items
    FROM public.purchase_order_items i CROSS JOIN LATERAL (
      SELECT coalesce(sum(e.accepted),0) AS received, CASE WHEN target IS NOT NULL THEN coalesce(
        jsonb_agg(jsonb_build_object('id',e.id,'date',e.received_on,'reference',e.delivery_ref,
          'quantity',e.quantity,'accepted',e.accepted,'rejected',e.rejected,
          'held',e.quantity-e.accepted-e.rejected,'notes',e.notes,'recordedBy',u.username)
          ORDER BY e.received_on DESC,e.recorded_at DESC,e.id),'[]'::jsonb) END AS history
      FROM desktop_private.store_receipts e LEFT JOIN public.users u ON u.id=e.actor_id WHERE e.line_id=i.id
    ) r WHERE i.po_id=v.id
  ) lines;
  RETURN jsonb_build_object('can_post',writable,'rows',coalesce(result,'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.read_po_receiving(uuid,uuid,uuid,text,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_po_receiving(uuid,uuid,uuid,text,date,date) TO service_role;

CREATE FUNCTION public.post_po_receiving(actor uuid, target uuid, event_date date, reference text, memo text, lines jsonb)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item record;
BEGIN
  IF NOT desktop_private.fulfillment_permission(actor,'purchasing') THEN RAISE insufficient_privilege; END IF;
  IF target IS NULL OR jsonb_typeof(lines) IS DISTINCT FROM 'array' OR jsonb_array_length(lines) NOT BETWEEN 1 AND 100
    OR EXISTS (SELECT 1 FROM jsonb_to_recordset(lines) AS e(line_id uuid, operation uuid)
      GROUP BY e.line_id HAVING count(*)>1) THEN RAISE invalid_parameter_value; END IF;
  FOR item IN SELECT * FROM jsonb_to_recordset(lines) AS e(
    line_id uuid,operation uuid,quantity numeric,accepted numeric,rejected numeric) ORDER BY line_id LOOP
    IF NOT EXISTS (SELECT 1 FROM public.purchase_order_items i WHERE i.id=item.line_id AND i.po_id=target)
      OR public.post_store_receipt(actor,item.operation,item.line_id,event_date,reference,item.quantity,
        item.accepted,item.rejected,memo) NOT IN ('applied','already-applied')
    THEN RAISE check_violation; END IF;
  END LOOP;
  RETURN 'applied';
END $$;
REVOKE ALL ON FUNCTION public.post_po_receiving(uuid,uuid,date,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.post_po_receiving(uuid,uuid,date,text,text,jsonb) TO service_role;
