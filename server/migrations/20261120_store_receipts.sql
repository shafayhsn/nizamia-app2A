CREATE OR REPLACE FUNCTION desktop_private.fulfillment_permission(actor uuid, area text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE member public.users%ROWTYPE;
DECLARE grant_row public.permissions%ROWTYPE;
BEGIN
  SELECT * INTO member FROM public.users u
    WHERE u.id=actor AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE AND u.deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE insufficient_privilege; END IF;
  IF member.role='admin' THEN RETURN true; END IF;
  SELECT * INTO grant_row FROM public.permissions p
    WHERE p.role_id=member.role_id AND p.module=area FOR SHARE;
  IF grant_row.can_view IS NOT TRUE THEN RAISE insufficient_privilege; END IF;
  RETURN grant_row.can_create IS TRUE;
END $$;
REVOKE ALL ON FUNCTION desktop_private.fulfillment_permission(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION desktop_private.fulfillment_permission(uuid,text) TO service_role;

CREATE TABLE desktop_private.store_receipts (
  id uuid PRIMARY KEY,
  line_id uuid NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  received_on date NOT NULL,
  delivery_ref text NOT NULL CHECK (char_length(delivery_ref) BETWEEN 1 AND 120),
  quantity numeric NOT NULL CHECK (quantity>0 AND quantity<=999999999 AND scale(quantity)<=3),
  accepted numeric NOT NULL CHECK (accepted>=0 AND scale(accepted)<=3),
  rejected numeric NOT NULL CHECK (rejected>=0 AND scale(rejected)<=3),
  notes text NOT NULL CHECK (char_length(notes)<=500),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (accepted+rejected<=quantity)
);
CREATE INDEX store_receipts_line ON desktop_private.store_receipts(line_id,recorded_at,id);
REVOKE ALL ON desktop_private.store_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON desktop_private.store_receipts TO service_role;

CREATE FUNCTION public.read_store_receipts(actor uuid, query text, after_id uuid, target uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE writable boolean:=desktop_private.fulfillment_permission(actor,'purchasing');
DECLARE result jsonb;
BEGIN
  IF target IS NOT NULL THEN
    SELECT jsonb_agg(to_jsonb(r)-'actor_id'||jsonb_build_object('recorded_by',u.username)
      ORDER BY r.recorded_at DESC,r.id DESC) INTO result
    FROM desktop_private.store_receipts r
    JOIN public.purchase_order_items i ON i.id=r.line_id
    CROSS JOIN LATERAL public.read_purchase_order_page(actor,NULL,i.po_id) visible
    LEFT JOIN public.users u ON u.id=r.actor_id
    WHERE r.line_id=target AND NOT (visible.document->>'details_hidden')::boolean;
    RETURN jsonb_build_object('history',coalesce(result,'[]'::jsonb));
  END IF;
  WITH lines AS (
    SELECT i.id,i.description AS label,i.specification AS detail,i.qty AS ordered,i.unit,p.po_number AS number,
      s.name AS partner,p.delivery_date AS due,p.status,
      visible.document->>'approval_verified'='true' AND lower(p.status) IN ('issued','acknowledged','delivered') AS open
    FROM public.purchase_order_items i JOIN public.purchase_orders p ON p.id=i.po_id
    CROSS JOIN LATERAL public.read_purchase_order_page(actor,NULL,p.id) visible
    LEFT JOIN public.suppliers s ON s.id=p.supplier_id
    WHERE (after_id IS NULL OR i.id>after_id)
      AND NOT (visible.document->>'details_hidden')::boolean
      AND (coalesce(query,'')='' OR strpos(lower(concat_ws(' ',p.po_number,i.description,s.name)),lower(query))>0)
      AND (lower(p.status) IN ('issued','acknowledged','delivered') OR EXISTS (
        SELECT 1 FROM desktop_private.store_receipts r WHERE r.line_id=i.id
      ))
    ORDER BY i.id LIMIT 51
  )
  SELECT jsonb_agg(to_jsonb(l)||to_jsonb(t)||jsonb_build_object('pending',greatest(0,l.ordered-t.accepted),'excess',greatest(0,t.accepted-l.ordered)) ORDER BY l.id)
  INTO result FROM lines l CROSS JOIN LATERAL (
    SELECT coalesce(sum(r.quantity),0) AS delivered,coalesce(sum(r.accepted),0) AS accepted,
      coalesce(sum(r.rejected),0) AS rejected,coalesce(sum(r.quantity-r.accepted-r.rejected),0) AS held
    FROM desktop_private.store_receipts r WHERE r.line_id=l.id
  ) t;
  RETURN jsonb_build_object('can_post',writable,'rows',coalesce(result,'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.read_store_receipts(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_store_receipts(uuid,text,uuid,uuid) TO service_role;

CREATE FUNCTION public.post_store_receipt(
  actor uuid, operation uuid, target uuid, event_date date, reference text,
  amount numeric, accepted_qty numeric, rejected_qty numeric, memo text
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE parent_id uuid;
DECLARE prior desktop_private.store_receipts%ROWTYPE;
DECLARE status text;
BEGIN
  IF NOT desktop_private.fulfillment_permission(actor,'purchasing') THEN RAISE insufficient_privilege; END IF;
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
