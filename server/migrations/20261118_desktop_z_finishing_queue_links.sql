CREATE OR REPLACE FUNCTION public.desktop_save_finishing(
 actor uuid,operation uuid,target_order uuid,header jsonb,enabled boolean,expected jsonb,packs jsonb
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.finishing_receipts%ROWTYPE;
 next_header public.finishing%ROWTYPE;
 old_header jsonb;
 old_packs jsonb;
 old_enabled boolean;
BEGIN
 IF actor IS NULL OR operation IS NULL OR target_order IS NULL OR enabled IS NULL
    OR coalesce(jsonb_typeof(header),'')<>'object' OR NOT expected ?& ARRAY['step_finishing','finishing','lines']
    OR coalesce(jsonb_typeof(expected->'lines'),'')<>'array' OR coalesce(jsonb_typeof(packs),'')<>'array'
    OR jsonb_array_length(packs)>300 THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin'
    AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE) THEN RETURN 'unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-finishing:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.finishing_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.order_id=target_order AND prior.header=header AND prior.enabled=enabled
   AND prior.expected=expected AND prior.packs=packs THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 next_header:=jsonb_populate_record(NULL::public.finishing,header);
 IF next_header.id IS NULL OR next_header.order_id IS DISTINCT FROM target_order
    OR next_header.use_cutting_qty IS NULL OR coalesce(next_header.total_qty,-1)<0 THEN RETURN 'invalid'; END IF;
 SELECT o.step_finishing INTO old_enabled FROM public.orders o WHERE o.id=target_order FOR UPDATE;
 IF NOT FOUND OR old_enabled IS DISTINCT FROM (expected->>'step_finishing')::boolean THEN RETURN 'conflict'; END IF;
 IF (SELECT count(*) FROM public.finishing WHERE order_id=target_order)>1 THEN RETURN 'conflict'; END IF;
 SELECT to_jsonb(f) INTO old_header FROM public.finishing f WHERE f.order_id=target_order FOR UPDATE;
 IF coalesce(old_header,'null'::jsonb) IS DISTINCT FROM expected->'finishing'
   OR (old_header IS NOT NULL AND next_header.id IS DISTINCT FROM (old_header->>'id')::uuid)
 THEN RETURN 'conflict'; END IF;
 PERFORM 1 FROM public.finishing_packs p WHERE p.order_id=target_order OR p.finishing_id=next_header.id FOR UPDATE;
 SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]') INTO old_packs FROM public.finishing_packs p
  WHERE p.order_id=target_order OR p.finishing_id=next_header.id;
 IF jsonb_array_length(old_packs)<>jsonb_array_length(expected->'lines')
  OR NOT (old_packs @> (expected->'lines') AND old_packs <@ (expected->'lines')) THEN RETURN 'conflict'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_populate_recordset(NULL::public.finishing_packs,packs) p WHERE
    p.id IS NULL OR p.order_id IS DISTINCT FROM target_order OR p.finishing_id IS DISTINCT FROM next_header.id)
 THEN RETURN 'invalid'; END IF;
 IF expected ? 'queues' THEN
  IF coalesce(jsonb_typeof(expected->'queues'),'')<>'array' THEN RETURN 'invalid'; END IF;
  PERFORM 1 FROM public.order_queues q WHERE q.order_id=target_order FOR SHARE;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(expected->'queues') x
   WHERE NOT EXISTS(SELECT 1 FROM public.order_queues q WHERE q.order_id=target_order
    AND q.id=(x->>'id')::uuid AND q.qty IS NOT DISTINCT FROM (x->>'qty')::integer))
  THEN RETURN 'conflict'; END IF;
 END IF;
 IF EXISTS(
  SELECT 1 FROM jsonb_populate_recordset(NULL::public.finishing_packs,packs) p
   CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.config->'lines')='array'
    THEN p.config->'lines' ELSE '[]'::jsonb END) line
  WHERE coalesce(p.packing_basis,p.pack_type)='By Q#'
   AND (NOT expected ? 'queues' OR
    (SELECT count(*) FROM public.order_queues q JOIN jsonb_array_elements(expected->'queues') x ON q.id=(x->>'id')::uuid
     WHERE q.order_id=target_order AND (q.id::text=line->>'key' OR nullif(q.q_number,'')=line->>'key'))<>1)
 ) THEN RETURN 'conflict'; END IF;
 IF old_header IS NULL THEN
  INSERT INTO public.finishing(id,order_id,use_cutting_qty,total_qty)
   VALUES(next_header.id,target_order,next_header.use_cutting_qty,next_header.total_qty);
 ELSE
  UPDATE public.finishing SET use_cutting_qty=next_header.use_cutting_qty,total_qty=next_header.total_qty WHERE id=next_header.id;
 END IF;
 DELETE FROM public.finishing_packs WHERE finishing_id=next_header.id;
 INSERT INTO public.finishing_packs(id,finishing_id,order_id,pack_name,pack_type,packing_basis,config,carton_l,carton_w,carton_h,carton_weight_kg,units_per_carton,qty_assigned,sort_order,inner_pack_type,pieces_per_pack,pieces_per_carton,length_cm,width_cm,height_cm,weight_kg,carton_style,assigned_qty,total_cartons,total_cbm)
 SELECT p.id,p.finishing_id,p.order_id,p.pack_name,p.pack_type,p.packing_basis,p.config,p.carton_l,p.carton_w,p.carton_h,p.carton_weight_kg,p.units_per_carton,p.qty_assigned,p.sort_order,p.inner_pack_type,p.pieces_per_pack,p.pieces_per_carton,p.length_cm,p.width_cm,p.height_cm,p.weight_kg,p.carton_style,p.assigned_qty,p.total_cartons,p.total_cbm
 FROM jsonb_populate_recordset(NULL::public.finishing_packs,packs) p;
 UPDATE public.orders SET step_finishing=enabled WHERE id=target_order;
 INSERT INTO desktop_private.finishing_receipts VALUES(operation,actor,target_order,header,enabled,expected,packs);
 RETURN 'applied';
EXCEPTION WHEN foreign_key_violation OR unique_violation THEN RETURN 'conflict';
 WHEN invalid_text_representation OR check_violation OR not_null_violation OR numeric_value_out_of_range THEN RETURN 'invalid';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_save_finishing(uuid,uuid,uuid,jsonb,boolean,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_save_finishing(uuid,uuid,uuid,jsonb,boolean,jsonb,jsonb) TO service_role;
