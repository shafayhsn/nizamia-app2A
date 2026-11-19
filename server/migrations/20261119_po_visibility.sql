-- Service-only projection used by the authenticated Purchasing endpoint.
CREATE FUNCTION public.read_purchase_order_page(actor uuid, after_id uuid, only_id uuid)
RETURNS TABLE(id uuid, document jsonb)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE member public.users%ROWTYPE;
BEGIN
  SELECT * INTO STRICT member FROM public.users u
    WHERE u.id=actor AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE;
  IF member.role IS DISTINCT FROM 'admin' AND NOT EXISTS (
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
      CASE WHEN member.role='admin' OR d.released THEN d.header||jsonb_build_object('purchase_order_items',d.lines)
      ELSE jsonb_build_object('id',d.id,'po_number',d.header->'po_number','status',d.header->'status',
        'po_date',d.header->'po_date','created_at',d.header->'created_at','delivery_date',d.header->'delivery_date',
        'currency',d.header->'currency','purchase_order_items',d.safe_lines) END
      || jsonb_build_object('approval_verified',d.released,'details_hidden',member.role IS DISTINCT FROM 'admin' AND NOT d.released)
    FROM docs d ORDER BY d.id;
END $$;
REVOKE ALL ON FUNCTION public.read_purchase_order_page(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_purchase_order_page(uuid,uuid,uuid) TO service_role;
