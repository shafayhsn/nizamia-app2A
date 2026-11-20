-- Dedicated staff workflows retain service-only RPC access.
-- Existing grants still apply. Restrictive policies intersect with any pre-existing policies.
CREATE OR REPLACE FUNCTION public.team_can_access(area text,verb text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT FROM nzos_private.edit_sessions e JOIN public.users u ON u.id=e.user_id
 LEFT JOIN public.permissions p ON p.role_id=u.role_id AND p.module=area
 WHERE e.proof_hash=sha256(convert_to(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-nzos-edit-proof','UTF8'))
 AND e.expires_at>now() AND u.is_active AND NOT coalesce(u.is_restricted,false) AND u.deleted_at IS NULL
 AND lower(u.role) NOT IN ('hr','production_incharge','sample_room','storekeeper')
 AND (u.role='admin' OR (area<>'settings' AND p.can_view AND CASE verb WHEN 'view' THEN true WHEN 'create' THEN p.can_create WHEN 'edit' THEN p.can_edit WHEN 'delete' THEN p.can_delete ELSE false END)));
$$;
REVOKE ALL ON FUNCTION public.team_can_access(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_can_access(text,text) TO anon,authenticated;


CREATE OR REPLACE FUNCTION desktop_private.fulfillment_permission(actor uuid, area text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE member public.users%ROWTYPE;
DECLARE grant_row public.permissions%ROWTYPE;
BEGIN
  SELECT * INTO member FROM public.users u
    WHERE u.id=actor AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE AND u.deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE insufficient_privilege; END IF;
  IF member.role='admin' THEN RETURN true; END IF;
  IF lower(member.role)='storekeeper' AND area='receiving' THEN RETURN true; END IF;
  IF lower(member.role) IN ('hr','production_incharge','sample_room','storekeeper') THEN RAISE insufficient_privilege; END IF;
  IF area='receiving' THEN area:='purchasing'; END IF;
  SELECT * INTO grant_row FROM public.permissions p
    WHERE p.role_id=member.role_id AND p.module=area FOR SHARE;
  IF grant_row.can_view IS NOT TRUE THEN RAISE insufficient_privilege; END IF;
  RETURN grant_row.can_create IS TRUE;
END $$;
REVOKE ALL ON FUNCTION desktop_private.fulfillment_permission(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION desktop_private.fulfillment_permission(uuid,text) TO service_role;

-- Service-only projection used by the authenticated Purchasing endpoint.
CREATE OR REPLACE FUNCTION public.read_purchase_order_page(actor uuid, after_id uuid, only_id uuid)
RETURNS TABLE(id uuid, document jsonb)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE member public.users%ROWTYPE;
BEGIN
  SELECT * INTO STRICT member FROM public.users u
    WHERE u.id=actor AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE AND u.deleted_at IS NULL;
  IF lower(member.role) IN ('hr','production_incharge','sample_room')
     OR (lower(member.role)='storekeeper' AND only_id IS NULL)
  THEN RAISE insufficient_privilege; END IF;
  IF member.role IS DISTINCT FROM 'admin'
     AND NOT (lower(member.role)='storekeeper' AND only_id IS NOT NULL)
     AND NOT EXISTS (
    SELECT 1 FROM public.permissions p WHERE p.role_id=member.role_id AND p.module='purchasing' AND p.can_view
  ) THEN RAISE insufficient_privilege; END IF;
  RETURN QUERY
    WITH page AS (
      SELECT p.* FROM public.purchase_orders p WHERE (after_id IS NULL OR p.id>after_id)
        AND (only_id IS NULL OR p.id=only_id) ORDER BY p.id LIMIT 100
    ), docs AS (
      SELECT p.id,to_jsonb(p)-'passkey_hash' AS header,
        coalesce(items.full_lines,'[]'::jsonb) AS lines,coalesce(items.safe_lines,'[]'::jsonb) AS safe_lines,
        coalesce(r.approved_at IS NOT NULL AND lower(p.status) IN ('approved','issued','acknowledged','delivered')
          AND r.document_version=jsonb_build_array(to_jsonb(p)-ARRAY['updated_at','created_at','status','passkey_hash'],items.full_lines),false) AS released
      FROM page p LEFT JOIN public.po_approval_requests r ON r.po_id=p.id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) AS full_lines,
          jsonb_agg(jsonb_build_object('description',i.description,'qty',i.qty,'unit',i.unit,
            'unit_rate',i.unit_rate,'amount',i.amount,'sort_order',i.sort_order) ORDER BY i.sort_order,i.id) AS safe_lines
        FROM public.purchase_order_items i WHERE i.po_id=p.id
      ) items ON true
    )
    SELECT d.id,
      CASE WHEN lower(member.role)='storekeeper' THEN jsonb_build_object('id',d.id)
      WHEN member.role='admin' OR d.released THEN d.header||jsonb_build_object('purchase_order_items',d.lines)
      ELSE jsonb_build_object('id',d.id,'po_number',d.header->'po_number','status',d.header->'status',
        'po_date',d.header->'po_date','created_at',d.header->'created_at','delivery_date',d.header->'delivery_date',
        'currency',d.header->'currency','purchase_order_items',d.safe_lines) END
      || jsonb_build_object('approval_verified',d.released,'details_hidden',member.role IS DISTINCT FROM 'admin' AND NOT d.released)
    FROM docs d ORDER BY d.id;
END $$;
REVOKE ALL ON FUNCTION public.read_purchase_order_page(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_purchase_order_page(uuid,uuid,uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.post_store_receipt(
  actor uuid, operation uuid, target uuid, event_date date, reference text,
  amount numeric, accepted_qty numeric, rejected_qty numeric, memo text
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE parent_id uuid;
DECLARE prior desktop_private.store_receipts%ROWTYPE;
DECLARE status text;
BEGIN
  IF NOT desktop_private.fulfillment_permission(actor,'receiving') THEN RAISE insufficient_privilege; END IF;
  IF operation IS NULL OR target IS NULL OR event_date IS NULL OR event_date>(now() AT TIME ZONE 'Asia/Karachi')::date
    OR amount IS NULL OR accepted_qty IS NULL OR rejected_qty IS NULL
    OR nullif(btrim(reference),'') IS NULL THEN RAISE invalid_parameter_value; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('store-receipt:'||operation::text,0));
  SELECT * INTO prior FROM desktop_private.store_receipts r WHERE r.id=operation;
  IF FOUND THEN
    IF ROW(prior.actor_id,prior.line_id,prior.received_on,prior.delivery_ref,prior.quantity,prior.accepted,prior.rejected,prior.notes)
      IS NOT DISTINCT FROM ROW(actor,target,event_date,btrim(reference),amount,accepted_qty,rejected_qty,btrim(coalesce(memo,'')))
    THEN RETURN 'already-applied'; END IF;
    RETURN 'conflict';
  END IF;

  SELECT i.po_id INTO parent_id FROM public.purchase_order_items i WHERE i.id=target;
  SELECT p.status INTO status FROM public.purchase_orders p WHERE p.id=parent_id FOR SHARE;
  PERFORM 1 FROM public.purchase_order_items i WHERE i.id=target AND i.po_id=parent_id FOR UPDATE;
  IF NOT FOUND OR status IS NULL OR lower(status) NOT IN ('issued','acknowledged','delivered') OR NOT EXISTS (
    SELECT 1 FROM public.read_purchase_order_page(actor,NULL,parent_id) v
    WHERE (v.document->>'approval_verified')::boolean
  ) THEN RETURN 'conflict'; END IF;

  INSERT INTO desktop_private.store_receipts(id,line_id,actor_id,received_on,delivery_ref,quantity,accepted,rejected,notes)
    VALUES(operation,target,actor,event_date,btrim(reference),amount,accepted_qty,rejected_qty,btrim(coalesce(memo,'')));
  RETURN 'applied';
END $$;
REVOKE ALL ON FUNCTION public.post_store_receipt(uuid,uuid,uuid,date,text,numeric,numeric,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.post_store_receipt(uuid,uuid,uuid,date,text,numeric,numeric,numeric,text) TO service_role;


CREATE OR REPLACE FUNCTION public.read_po_receiving(actor uuid, target uuid, after_id uuid, query text, start_date date, end_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE writable boolean:=desktop_private.fulfillment_permission(actor,'receiving');
DECLARE result jsonb;
BEGIN
  IF target IS NULL AND EXISTS(SELECT FROM public.users u WHERE u.id=actor AND lower(u.role)='storekeeper')
  THEN RAISE insufficient_privilege; END IF;
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

CREATE OR REPLACE FUNCTION public.post_po_receiving(actor uuid, target uuid, event_date date, reference text, memo text, lines jsonb)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item record;
BEGIN
  IF NOT desktop_private.fulfillment_permission(actor,'receiving') THEN RAISE insufficient_privilege; END IF;
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


CREATE OR REPLACE FUNCTION public.desktop_create_production_entry(actor uuid, operation uuid, payload jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  prior desktop_private.production_create_receipts%ROWTYPE;
  requested public.production_daily_entries%ROWTYPE;
BEGIN
  IF actor IS NULL OR operation IS NULL OR payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RETURN 'invalid';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = actor AND (lower(u.role) IN ('admin','production_incharge')
      OR (lower(u.role) NOT IN ('hr','sample_room','storekeeper') AND desktop_private.team_permission(actor,'production','create')))
      AND u.deleted_at IS NULL AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE
    FOR SHARE
  ) THEN RETURN 'unauthorized'; END IF;

  IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) AS field(name)
    WHERE field.name NOT IN ('order_id','size_group_id','color_id','department','movement','production_date','production_at','quantity')) THEN
    RETURN 'invalid';
  END IF;
  BEGIN
    requested := jsonb_populate_record(NULL::public.production_daily_entries,payload);
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range THEN
    RETURN 'invalid';
  END;
  IF requested.order_id IS NULL OR requested.size_group_id IS NULL OR requested.color_id IS NULL
    OR requested.quantity IS NULL OR requested.quantity <= 0 OR requested.production_date IS NULL
    OR requested.department IS NULL OR requested.department NOT IN ('Cutting','Stitching','Washing','Back Process','Finishing','Packing','Embroidery','Printing','Other')
    OR requested.movement IS NULL OR requested.movement NOT IN ('completed','sent','received')
    OR (requested.movement <> 'completed' AND requested.department NOT IN ('Washing','Embroidery','Printing','Other'))
    OR char_length(requested.production_at) > 1000
  THEN RETURN 'invalid'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('desktop-production:'||operation::text,0));
  SELECT * INTO prior FROM desktop_private.production_create_receipts WHERE operation_id=operation;
  IF FOUND THEN
    IF prior.actor_id=actor AND prior.payload=payload THEN RETURN 'already-applied'; END IF;
    RETURN 'conflict';
  END IF;

  INSERT INTO public.production_daily_entries (
    id,order_id,size_group_id,color_id,job_number,buyer_name,style_number,po_number,store_name,
    wash_name,size_group_name,department,movement,production_date,production_at,quantity,created_by
  )
  SELECT operation,o.id,g.id,c.id,o.job_number,o.buyer_name,o.style_number,o.po_number,o.store_name,
    coalesce(nullif(c.color_name,''),'—'),coalesce(nullif(g.group_name,''),'—'),
    requested.department,requested.movement,requested.production_date,requested.production_at,requested.quantity,actor
  FROM public.orders o
  JOIN public.size_groups g ON g.order_id=o.id
  JOIN public.size_group_colors c ON c.size_group_id=g.id
  WHERE o.id=requested.order_id AND g.id=requested.size_group_id AND c.id=requested.color_id
    AND btrim(coalesce(o.job_number,''))<>'' AND coalesce(o.status,'') !~* 'cancelled|canceled'
  FOR SHARE OF o,g,c
  ON CONFLICT (id) DO NOTHING;
  IF NOT FOUND THEN RETURN 'conflict'; END IF;
  INSERT INTO desktop_private.production_create_receipts VALUES (operation,actor,payload);
  RETURN 'applied';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_create_production_entry(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_create_production_entry(uuid,uuid,jsonb) TO service_role;


CREATE OR REPLACE FUNCTION public.desktop_update_sample_stage(
 actor uuid, operation uuid, target_sample uuid, previous_stage text, new_stage text
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.sample_stage_receipts%ROWTYPE;
 changed public.samples%ROWTYPE;
BEGIN
 IF actor IS NULL OR operation IS NULL OR target_sample IS NULL OR new_stage IS NULL
    OR new_stage NOT IN ('Not Started','Pattern','Cutting','Stitching','Washing','Finishing','Ready')
 THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=actor AND (lower(u.role) IN ('admin','sample_room') OR (lower(u.role) NOT IN ('hr','production_incharge','storekeeper') AND EXISTS(SELECT FROM public.permissions p WHERE p.role_id=u.role_id AND p.module='sampling' AND p.can_view AND p.can_edit)))
    AND u.deleted_at IS NULL AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE)
 THEN RETURN 'unauthorized'; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-sample-stage:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.sample_stage_receipts WHERE operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.sample_id=target_sample AND prior.previous_stage IS NOT DISTINCT FROM previous_stage
     AND prior.new_stage=new_stage THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 UPDATE public.samples AS s SET stage=new_stage
 WHERE s.id=target_sample AND s.stage IS NOT DISTINCT FROM previous_stage
   AND (coalesce(s.dispatch_status,'') NOT IN ('Dispatched','Delivered')
     OR NOT EXISTS(SELECT FROM public.users u WHERE u.id=actor AND lower(u.role)='sample_room'))
 RETURNING s.* INTO changed;
 IF NOT FOUND THEN RETURN 'conflict'; END IF;
 INSERT INTO public.sample_comments(id,sample_id,root_sample_id,sam_number,version_label,comment_type,
     comment_text,comment_date,is_internal)
 VALUES(operation,changed.id,coalesce(changed.root_sample_id,changed.id),changed.sample_number,
     coalesce(changed.version_label,'V1'),'Stage',coalesce(previous_stage,'Not Started')||' → '||new_stage,now(),true);
 INSERT INTO desktop_private.sample_stage_receipts VALUES(operation,actor,target_sample,previous_stage,new_stage);
 RETURN 'applied';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_update_sample_stage(uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_update_sample_stage(uuid,uuid,uuid,text,text) TO service_role;



CREATE FUNCTION public.staff_receiving_list(actor uuid, after_id uuid)
RETURNS TABLE(id uuid, po_number text, status text, delivery_date date, supplier text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS(SELECT FROM public.users u WHERE u.id=actor AND lower(u.role)='storekeeper'
    AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE AND u.deleted_at IS NULL FOR SHARE)
  THEN RAISE insufficient_privilege; END IF;
  RETURN QUERY
    SELECT p.id,p.po_number::text,p.status::text,p.delivery_date::date,s.name::text
    FROM public.purchase_orders p
    LEFT JOIN public.suppliers s ON s.id=p.supplier_id
    CROSS JOIN LATERAL public.read_purchase_order_page(actor,NULL,p.id) visible
    WHERE (after_id IS NULL OR p.id>after_id)
    AND lower(p.status) IN ('issued','acknowledged','delivered')
    AND (visible.document->>'approval_verified')::boolean
    ORDER BY p.id LIMIT 100;
END $$;
REVOKE ALL ON FUNCTION public.staff_receiving_list(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staff_receiving_list(uuid,uuid) TO service_role;

CREATE FUNCTION public.staff_production_list(actor uuid, after_id uuid)
RETURNS TABLE(id uuid, order_id uuid, group_id uuid, job_number text, style_number text, po_number text, wash text, size_group text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS(SELECT FROM public.users u WHERE u.id=actor AND lower(u.role)='production_incharge'
    AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE AND u.deleted_at IS NULL FOR SHARE)
  THEN RAISE insufficient_privilege; END IF;
  RETURN QUERY
    SELECT c.id,o.id,g.id,o.job_number::text,o.style_number::text,o.po_number::text,c.color_name::text,g.group_name::text
    FROM public.size_group_colors c
    JOIN public.size_groups g ON g.id=c.size_group_id
    JOIN public.orders o ON o.id=g.order_id
    WHERE (after_id IS NULL OR c.id>after_id) AND btrim(coalesce(o.job_number,''))<>''
      AND coalesce(o.status,'') !~* 'cancelled|canceled'
    ORDER BY c.id LIMIT 100;
END $$;
REVOKE ALL ON FUNCTION public.staff_production_list(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staff_production_list(uuid,uuid) TO service_role;
