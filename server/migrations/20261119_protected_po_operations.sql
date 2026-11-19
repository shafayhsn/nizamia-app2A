CREATE FUNCTION public.remove_po_records(actor uuid, target uuid, parent_orders uuid[], expected_time timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE member public.users%ROWTYPE; ids uuid[]; stamp timestamptz;
BEGIN
  SELECT * INTO STRICT member FROM public.users WHERE id=actor AND is_active AND is_restricted IS NOT TRUE FOR SHARE;
  IF (target IS NULL)=(parent_orders IS NULL) THEN RAISE invalid_parameter_value; END IF;
  IF target IS NOT NULL AND member.role IS DISTINCT FROM 'admin' THEN RAISE insufficient_privilege; END IF;
  IF parent_orders IS NOT NULL AND member.role IS DISTINCT FROM 'admin' AND NOT EXISTS (
    SELECT 1 FROM public.permissions WHERE role_id=member.role_id AND module='orders' AND can_view AND can_delete
  ) THEN RAISE insufficient_privilege; END IF;
  LOCK TABLE public.purchase_orders, public.purchase_order_items IN SHARE ROW EXCLUSIVE MODE;
  IF target IS NOT NULL THEN
    SELECT updated_at INTO STRICT stamp FROM public.purchase_orders WHERE id=target;
    IF stamp IS DISTINCT FROM expected_time THEN RAISE EXCEPTION 'PO changed. Refresh before deleting.'; END IF;
    ids:=ARRAY[target];
  ELSE
    SELECT array_agg(id) INTO ids FROM public.purchase_orders WHERE order_id=ANY(parent_orders);
    IF member.role IS DISTINCT FROM 'admin' AND (ids IS NOT NULL OR EXISTS(
      SELECT 1 FROM public.purchase_order_items i JOIN public.order_queues q ON q.id=i.source_id
      WHERE i.source_type='queue' AND q.order_id=ANY(parent_orders)
    )) THEN RAISE insufficient_privilege; END IF;
    DELETE FROM public.purchase_order_items i USING public.order_queues q
      WHERE i.source_type='queue' AND i.source_id=q.id AND q.order_id=ANY(parent_orders);
  END IF;
  DELETE FROM public.purchase_order_items WHERE po_id=ANY(ids);
  DELETE FROM public.purchase_order_changelog WHERE po_id=ANY(ids);
  UPDATE public.app_tasks t SET status='Completed',completed_at=now(),description='Purchase order removed.'
    FROM public.po_approval_requests r WHERE r.po_id=ANY(ids) AND t.id=r.task_id;
  DELETE FROM public.purchase_orders WHERE id=ANY(ids);
  IF parent_orders IS NOT NULL THEN
    -- Remove the same dependencies as the Orders screen in one transaction.
    DELETE FROM public.size_group_breakdown WHERE color_id IN (SELECT c.id FROM public.size_group_colors c JOIN public.size_groups g ON g.id=c.size_group_id WHERE g.order_id=ANY(parent_orders));
    DELETE FROM public.size_group_colors WHERE size_group_id IN (SELECT id FROM public.size_groups WHERE order_id=ANY(parent_orders));
    DELETE FROM public.size_groups WHERE order_id=ANY(parent_orders);
    DELETE FROM public.order_queues WHERE order_id=ANY(parent_orders);
    DELETE FROM public.finishing_packs WHERE finishing_id IN(SELECT id FROM public.finishing WHERE order_id=ANY(parent_orders));
    DELETE FROM public.sample_comments WHERE sample_id IN(SELECT id FROM public.samples WHERE order_id=ANY(parent_orders));
    DELETE FROM public.sample_logs WHERE sample_id IN(SELECT id FROM public.samples WHERE order_id=ANY(parent_orders));
    DELETE FROM public.samples WHERE order_id=ANY(parent_orders);
    DELETE FROM public.bom_items WHERE order_id=ANY(parent_orders);
    DELETE FROM public.fitting WHERE order_id=ANY(parent_orders);
    DELETE FROM public.washing WHERE order_id=ANY(parent_orders);
    DELETE FROM public.embellishments WHERE order_id=ANY(parent_orders);
    DELETE FROM public.finishing WHERE order_id=ANY(parent_orders);
    DELETE FROM public.order_processes WHERE order_id=ANY(parent_orders);
    DELETE FROM public.work_order_items WHERE wo_id IN(SELECT id FROM public.work_orders WHERE order_id=ANY(parent_orders));
    DELETE FROM public.work_order_changelog WHERE wo_id IN(SELECT id FROM public.work_orders WHERE order_id=ANY(parent_orders));
    DELETE FROM public.work_orders WHERE order_id=ANY(parent_orders);
    DELETE FROM public.orders WHERE id=ANY(parent_orders);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.remove_po_records(uuid,uuid,uuid[],timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remove_po_records(uuid,uuid,uuid[],timestamptz) TO service_role;

CREATE FUNCTION public.read_po_history(actor uuid, ids uuid[], after_id uuid)
RETURNS SETOF public.purchase_order_changelog LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
  SELECT h.* FROM (SELECT DISTINCT unnest(ids) AS po LIMIT 50) targets
  CROSS JOIN LATERAL public.read_purchase_order_page(actor,NULL,targets.po) visible
  JOIN public.purchase_order_changelog h ON h.po_id=visible.id
  WHERE NOT (visible.document->>'details_hidden')::boolean AND (after_id IS NULL OR h.id>after_id)
  ORDER BY h.id LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.read_po_history(uuid,uuid[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_po_history(uuid,uuid[],uuid) TO service_role;

CREATE FUNCTION public.set_reviewed_po_stage(actor uuid,target uuid,expected_time timestamptz,next_stage text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE po public.purchase_orders%ROWTYPE; verified boolean;
BEGIN
  IF next_stage IS NULL OR next_stage NOT IN ('Issued','Acknowledged','Delivered','Cancelled') THEN RAISE invalid_parameter_value; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.is_active AND u.is_restricted IS NOT TRUE AND
    (u.role='admin' OR EXISTS(SELECT 1 FROM public.permissions p WHERE p.role_id=u.role_id AND p.module='purchasing' AND p.can_view AND p.can_edit)) FOR SHARE)
  THEN RAISE insufficient_privilege; END IF;
  LOCK TABLE public.purchase_order_items IN SHARE MODE;
  SELECT * INTO STRICT po FROM public.purchase_orders WHERE id=target FOR UPDATE;
  SELECT (v.document->>'approval_verified')::boolean INTO verified FROM public.read_purchase_order_page(actor,NULL,target) v;
  IF verified IS NOT TRUE OR po.updated_at IS DISTINCT FROM expected_time THEN RAISE EXCEPTION 'Refresh the PO and check its approval first.'; END IF;
  UPDATE public.purchase_orders SET status=next_stage,updated_at=now() WHERE id=target;
END $$;
REVOKE ALL ON FUNCTION public.set_reviewed_po_stage(uuid,uuid,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_reviewed_po_stage(uuid,uuid,timestamptz,text) TO service_role;
