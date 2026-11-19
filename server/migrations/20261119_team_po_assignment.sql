CREATE FUNCTION public.create_assigned_po(actor uuid,operation uuid,kind text,header jsonb,lines jsonb,approver uuid)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE outcome text;
BEGIN
 IF kind IS DISTINCT FROM 'purchase_orders' OR approver IS NULL THEN RETURN 'invalid'; END IF;
 outcome:=public.desktop_create_purchasing_document(actor,operation,kind,header,lines);
 IF outcome='applied' THEN
   PERFORM public.review_purchase_order(actor,operation,approver,false);
 ELSIF outcome='already-applied' AND NOT EXISTS(SELECT FROM public.po_approval_requests r WHERE r.po_id=operation AND r.approver_id=approver) THEN
   RETURN 'conflict';
 END IF;
 RETURN outcome;
END $$;
REVOKE ALL ON FUNCTION public.create_assigned_po(uuid,uuid,text,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_assigned_po(uuid,uuid,text,jsonb,jsonb,uuid) TO service_role;
