CREATE TABLE IF NOT EXISTS desktop_private.order_removal_receipts (
 operation_id uuid PRIMARY KEY,actor_id uuid NOT NULL,orders uuid[] NOT NULL,expected jsonb NOT NULL
);
REVOKE ALL ON desktop_private.order_removal_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.order_removal_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_remove_orders(actor uuid,operation uuid,target_orders uuid[],expected jsonb)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.order_removal_receipts%ROWTYPE;
 actual jsonb;
 kind text;
 group_rows jsonb;
BEGIN
 IF actor IS NULL OR operation IS NULL OR coalesce(cardinality(target_orders),0) NOT BETWEEN 1 AND 50
 OR (SELECT count(DISTINCT id) FROM unnest(target_orders) id)<>cardinality(target_orders)
 OR coalesce(jsonb_typeof(expected),'')<>'object' THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin' AND u.is_active IS TRUE
     AND u.is_restricted IS NOT TRUE FOR SHARE) THEN RETURN 'unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-remove-orders:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.order_removal_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.orders=target_orders AND prior.expected=expected THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 -- Serialize verification and removal with concurrent writes to the linked records.
 LOCK TABLE public.bom_items, public.embellishments, public.finishing, public.finishing_color_packing, public.finishing_packs, public.fitting, public.fitting_blocks, public.order_processes, public.order_queues, public.orders, public.packing_snapshots, public.parcels, public.pp_meetings, public.production_batch_orders, public.production_daily_entries, public.purchase_order_changelog, public.purchase_order_items, public.purchase_orders, public.sample_comments, public.sample_logs, public.samples, public.shipment_lines, public.shipping_booking_lines, public.size_group_breakdown, public.size_group_colors, public.size_groups, public.testing_requirements, public.washing, public.work_order_changelog, public.work_order_items, public.work_orders IN SHARE ROW EXCLUSIVE MODE;
 IF (SELECT count(*) FROM public.orders WHERE id=ANY(target_orders))<>cardinality(target_orders)
  OR EXISTS(SELECT 1 FROM public.production_daily_entries WHERE order_id=ANY(target_orders))
  OR EXISTS(SELECT 1 FROM public.shipping_booking_lines WHERE order_id=ANY(target_orders))
  OR EXISTS(SELECT 1 FROM public.shipment_lines WHERE order_id=ANY(target_orders))
  OR EXISTS(SELECT 1 FROM public.production_batch_orders WHERE order_id=ANY(target_orders))
  OR EXISTS(SELECT 1 FROM public.pp_meetings WHERE order_id=ANY(target_orders))
  OR EXISTS(SELECT 1 FROM public.packing_snapshots WHERE order_id=ANY(target_orders))
  OR EXISTS(SELECT 1 FROM public.testing_requirements WHERE order_id=ANY(target_orders))

  OR EXISTS(SELECT 1 FROM public.shipment_lines l JOIN public.order_queues q ON q.id=l.queue_id WHERE q.order_id=ANY(target_orders))
  OR EXISTS(SELECT 1 FROM public.shipping_booking_lines l JOIN public.order_queues q ON q.id=l.queue_id WHERE q.order_id=ANY(target_orders))
  OR EXISTS(SELECT 1 FROM public.parcels p CROSS JOIN LATERAL jsonb_array_elements(
   CASE WHEN jsonb_typeof(p.items)='array' THEN p.items ELSE '[]'::jsonb END) x
   JOIN public.samples s ON s.id::text=x->>'sampleId' WHERE s.order_id=ANY(target_orders))
  OR EXISTS(SELECT 1 FROM public.samples external JOIN public.samples own ON own.id IN(external.root_sample_id,external.parent_sample_id)
    WHERE own.order_id=ANY(target_orders) AND NOT coalesce(external.order_id=ANY(target_orders),false))
  OR EXISTS(SELECT 1 FROM public.sample_comments external JOIN public.samples own ON own.id=external.root_sample_id
    LEFT JOIN public.samples child ON child.id=external.sample_id
    WHERE own.order_id=ANY(target_orders) AND NOT coalesce(child.order_id=ANY(target_orders),false))
  OR EXISTS(SELECT 1 FROM public.sample_logs external JOIN public.samples own ON own.id=external.root_sample_id
    LEFT JOIN public.samples child ON child.id=external.sample_id
    WHERE own.order_id=ANY(target_orders) AND NOT coalesce(child.order_id=ANY(target_orders),false))
 THEN RETURN 'conflict'; END IF;
 WITH selected_orders AS (SELECT * FROM public.orders WHERE id=ANY(target_orders)),
 selected_size_groups AS (SELECT * FROM public.size_groups WHERE order_id=ANY(target_orders)),
 selected_order_queues AS (SELECT * FROM public.order_queues WHERE order_id=ANY(target_orders)),
 selected_finishing AS (SELECT * FROM public.finishing WHERE order_id=ANY(target_orders)),
 selected_samples AS (SELECT * FROM public.samples WHERE order_id=ANY(target_orders)),
 selected_bom_items AS (SELECT * FROM public.bom_items WHERE order_id=ANY(target_orders)),
 selected_fitting AS (SELECT * FROM public.fitting WHERE order_id=ANY(target_orders)),
 selected_fitting_blocks AS (SELECT * FROM public.fitting_blocks WHERE order_id=ANY(target_orders)),
 selected_washing AS (SELECT * FROM public.washing WHERE order_id=ANY(target_orders)),
 selected_embellishments AS (SELECT * FROM public.embellishments WHERE order_id=ANY(target_orders)),
 selected_order_processes AS (SELECT * FROM public.order_processes WHERE order_id=ANY(target_orders)),
 selected_work_orders AS (SELECT * FROM public.work_orders WHERE order_id=ANY(target_orders)),
 selected_purchase_orders AS (SELECT * FROM public.purchase_orders WHERE order_id=ANY(target_orders)),
 rows AS (
 SELECT 'orders'::text AS kind,to_jsonb(t) AS row FROM selected_orders t
 UNION ALL SELECT 'size_groups',to_jsonb(r) FROM selected_size_groups r
 UNION ALL SELECT 'order_queues',to_jsonb(r) FROM selected_order_queues r
 UNION ALL SELECT 'finishing',to_jsonb(r) FROM selected_finishing r
 UNION ALL SELECT 'samples',to_jsonb(r) FROM selected_samples r
 UNION ALL SELECT 'bom_items',to_jsonb(r) FROM selected_bom_items r
 UNION ALL SELECT 'fitting',to_jsonb(r) FROM selected_fitting r
 UNION ALL SELECT 'fitting_blocks',to_jsonb(r) FROM selected_fitting_blocks r
 UNION ALL SELECT 'washing',to_jsonb(r) FROM selected_washing r
 UNION ALL SELECT 'embellishments',to_jsonb(r) FROM selected_embellishments r
 UNION ALL SELECT 'order_processes',to_jsonb(r) FROM selected_order_processes r
 UNION ALL SELECT 'work_orders',to_jsonb(r) FROM selected_work_orders r
 UNION ALL SELECT 'purchase_orders',to_jsonb(r) FROM selected_purchase_orders r
 UNION ALL SELECT 'size_group_colors',to_jsonb(r) FROM public.size_group_colors r WHERE size_group_id IN (SELECT id FROM selected_size_groups)
 UNION ALL SELECT 'size_group_breakdown',to_jsonb(r) FROM public.size_group_breakdown r WHERE size_group_id IN (SELECT id FROM selected_size_groups)
 UNION ALL SELECT 'finishing_packs',to_jsonb(r) FROM public.finishing_packs r WHERE finishing_id IN (SELECT id FROM selected_finishing)
 UNION ALL SELECT 'finishing_color_packing',to_jsonb(r) FROM public.finishing_color_packing r WHERE finishing_id IN (SELECT id FROM selected_finishing)
 UNION ALL SELECT 'sample_comments',to_jsonb(r) FROM public.sample_comments r WHERE sample_id IN (SELECT id FROM selected_samples)
 UNION ALL SELECT 'sample_logs',to_jsonb(r) FROM public.sample_logs r WHERE sample_id IN (SELECT id FROM selected_samples)
 UNION ALL SELECT 'work_order_items',to_jsonb(r) FROM public.work_order_items r WHERE wo_id IN (SELECT id FROM selected_work_orders)
 UNION ALL SELECT 'work_order_changelog',to_jsonb(r) FROM public.work_order_changelog r WHERE wo_id IN (SELECT id FROM selected_work_orders)
 UNION ALL SELECT 'purchase_order_changelog',to_jsonb(r) FROM public.purchase_order_changelog r WHERE po_id IN (SELECT id FROM selected_purchase_orders)
 UNION ALL SELECT 'purchase_order_items',to_jsonb(r) FROM public.purchase_order_items r WHERE po_id IN (SELECT id FROM selected_purchase_orders) OR source_type='queue' AND source_id IN (SELECT id FROM selected_order_queues)
 ), grouped AS (SELECT rows.kind,jsonb_agg(rows.row) AS entries FROM rows GROUP BY rows.kind)
 SELECT coalesce(jsonb_object_agg(grouped.kind,entries),'{}') INTO actual FROM grouped;
 FOREACH kind IN ARRAY ARRAY['orders','size_groups','order_queues','finishing','samples','bom_items','fitting','fitting_blocks','washing','embellishments','order_processes','work_orders','purchase_orders','size_group_colors','size_group_breakdown','finishing_packs','finishing_color_packing','sample_comments','sample_logs','work_order_items','work_order_changelog','purchase_order_changelog','purchase_order_items'] LOOP
  group_rows:=coalesce(actual->kind,'[]'::jsonb);
  IF coalesce(jsonb_typeof(expected->kind),'')<>'array'
   OR jsonb_array_length(expected->kind)<>jsonb_array_length(group_rows)
   OR NOT (group_rows @> (expected->kind) AND group_rows <@ (expected->kind))
  THEN RETURN 'conflict'; END IF;
 END LOOP;
 DELETE FROM public.purchase_order_items i WHERE i.source_type='queue'
  AND i.source_id IN (SELECT id FROM public.order_queues WHERE order_id=ANY(target_orders));
 DELETE FROM public.washing WHERE order_id=ANY(target_orders);
 DELETE FROM public.work_orders WHERE order_id=ANY(target_orders);
 DELETE FROM public.purchase_orders WHERE order_id=ANY(target_orders);
 DELETE FROM public.orders WHERE id=ANY(target_orders);
 INSERT INTO desktop_private.order_removal_receipts VALUES(operation,actor,target_orders,expected);
 RETURN 'applied';
EXCEPTION WHEN foreign_key_violation OR check_violation THEN RETURN 'conflict';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_remove_orders(uuid,uuid,uuid[],jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_remove_orders(uuid,uuid,uuid[],jsonb) TO service_role;
