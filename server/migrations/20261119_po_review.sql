CREATE TABLE public.po_approval_requests (
  po_id uuid PRIMARY KEY REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES public.users(id),
  requested_by uuid NOT NULL REFERENCES public.users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  task_id uuid NOT NULL UNIQUE REFERENCES public.app_tasks(id),
  document_version jsonb NOT NULL,
  approved_at timestamptz
);
ALTER TABLE public.po_approval_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.po_approval_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.po_approval_requests TO service_role;

CREATE FUNCTION public.review_purchase_order(actor uuid, target uuid, approver uuid, approve boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  member public.users%ROWTYPE;
  po public.purchase_orders%ROWTYPE;
  review public.po_approval_requests%ROWTYPE;
  items jsonb;
  version jsonb;
  task uuid;
BEGIN
  SELECT * INTO STRICT member FROM public.users
    WHERE id=actor AND is_active IS TRUE AND is_restricted IS NOT TRUE FOR SHARE;
  IF approve THEN
    IF member.role IS DISTINCT FROM 'admin' THEN RAISE insufficient_privilege; END IF;
  ELSIF member.role IS DISTINCT FROM 'admin' THEN
    PERFORM 1 FROM public.permissions WHERE role_id=member.role_id AND module='purchasing'
      AND can_view AND can_create FOR SHARE;
    IF NOT FOUND THEN RAISE insufficient_privilege; END IF;
  END IF;
  SELECT * INTO STRICT po FROM public.purchase_orders WHERE id=target FOR UPDATE;
  -- Include line insertions in the same consistent review as header changes.
  LOCK TABLE public.purchase_order_items IN SHARE MODE;
  SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) INTO items FROM public.purchase_order_items i WHERE po_id=target;
  IF items IS NULL THEN RAISE EXCEPTION 'Add a PO item before requesting approval'; END IF;
  version:=jsonb_build_array(to_jsonb(po)-ARRAY['updated_at','created_at','status','passkey_hash'],items);
  SELECT * INTO review FROM public.po_approval_requests WHERE po_id=target FOR UPDATE;
  IF approve THEN
    IF review.approver_id IS DISTINCT FROM actor THEN RAISE insufficient_privilege; END IF;
    IF review.document_version IS DISTINCT FROM version THEN RAISE EXCEPTION 'PO changed. Submit this version for review'; END IF;
    IF review.approved_at IS NOT NULL AND lower(po.status)='approved' THEN RETURN review.task_id; END IF;
    IF lower(po.status) IS DISTINCT FROM 'draft' OR review.approved_at IS NOT NULL THEN RAISE EXCEPTION 'PO is not awaiting approval'; END IF;
    UPDATE public.purchase_orders SET status='approved',updated_at=now() WHERE id=target;
    UPDATE public.app_tasks SET status='Completed', completed_at=now() WHERE id=review.task_id;
    UPDATE public.po_approval_requests SET approved_at=now() WHERE po_id=target;
    RETURN review.task_id;
  END IF;
  IF lower(po.status) IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Only drafts can be submitted'; END IF;
  PERFORM 1 FROM public.users WHERE id=approver AND role='admin' AND is_active IS TRUE AND is_restricted IS NOT TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select an active admin'; END IF;
  IF review.task_id IS NOT NULL THEN
    IF review.requested_by<>actor AND member.role<>'admin' THEN RAISE insufficient_privilege; END IF;
    IF review.approver_id<>approver AND member.role<>'admin' THEN RAISE EXCEPTION 'Already assigned to a different admin'; END IF;
    task:=review.task_id;
    UPDATE public.app_tasks SET assignee_id=approver,status='Pending',completed_at=NULL WHERE id=task;
    UPDATE public.po_approval_requests SET approver_id=approver,document_version=version,approved_at=NULL WHERE po_id=target;
  ELSE
    INSERT INTO public.app_tasks(id,title,assignee_id,created_by,due_date,priority,status,related_record)
      VALUES(gen_random_uuid(),'Approve PO '||po.po_number,approver,actor,current_date,'Normal','Pending','PO approval: '||target) RETURNING id INTO task;
    INSERT INTO public.po_approval_requests(po_id,approver_id,requested_by,task_id,document_version)
      VALUES(target,approver,actor,task,version);
  END IF;
  RETURN task;
END $$;
REVOKE ALL ON FUNCTION public.review_purchase_order(uuid,uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_purchase_order(uuid,uuid,uuid,boolean) TO service_role;
