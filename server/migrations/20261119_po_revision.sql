-- Reopen the existing task if a reviewed header or any reviewed line changes.
CREATE FUNCTION public.invalidate_po_review(target uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE task uuid;
BEGIN
  UPDATE public.po_approval_requests SET approved_at=NULL,document_version='null'::jsonb
    WHERE po_id=target AND document_version<>'null'::jsonb RETURNING task_id INTO task;
  IF task IS NOT NULL THEN
    UPDATE public.purchase_orders SET status='Draft',updated_at=now() WHERE id=target;
    UPDATE public.app_tasks SET status='Pending',completed_at=NULL WHERE id=task;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.invalidate_po_review(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.on_po_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_TABLE_NAME='purchase_orders' THEN
    IF (to_jsonb(NEW)-ARRAY['updated_at','status']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','status']) THEN
      PERFORM public.invalidate_po_review(NEW.id);
    END IF;
  ELSE
    IF TG_OP<>'INSERT' THEN PERFORM public.invalidate_po_review(OLD.po_id); END IF;
    IF TG_OP<>'DELETE' THEN PERFORM public.invalidate_po_review(NEW.po_id); END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.on_po_revision() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER po_revision_header AFTER UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.on_po_revision();
CREATE TRIGGER po_revision_line AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.on_po_revision();
