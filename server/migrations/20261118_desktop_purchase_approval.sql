CREATE SCHEMA IF NOT EXISTS desktop_private;
REVOKE ALL ON SCHEMA desktop_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA desktop_private TO service_role;

CREATE TABLE IF NOT EXISTS desktop_private.purchase_approval_receipts (
  operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, purchase_order_id uuid NOT NULL,
  previous_status text, new_status text NOT NULL
);
REVOKE ALL ON desktop_private.purchase_approval_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.purchase_approval_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_update_purchase_approval(
  actor uuid, operation uuid, target_purchase_order uuid, previous_status text, new_status text
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE prior desktop_private.purchase_approval_receipts%ROWTYPE;
BEGIN
  IF actor IS NULL OR operation IS NULL OR target_purchase_order IS NULL OR new_status IS NULL
     OR new_status NOT IN ('draft','approved') THEN RETURN 'invalid'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin'
      AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE
  ) THEN RETURN 'unauthorized'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('desktop-purchase-approval:'||operation::text,0));
  SELECT * INTO prior FROM desktop_private.purchase_approval_receipts WHERE operation_id=operation;
  IF FOUND THEN
    IF prior.actor_id=actor AND prior.purchase_order_id=target_purchase_order
      AND prior.previous_status IS NOT DISTINCT FROM previous_status AND prior.new_status=new_status
    THEN RETURN 'already-applied'; END IF;
    RETURN 'conflict';
  END IF;
  UPDATE public.purchase_orders AS o SET status=new_status
    WHERE o.id=target_purchase_order AND o.status IS NOT DISTINCT FROM previous_status;
  IF NOT FOUND THEN RETURN 'conflict'; END IF;
  INSERT INTO desktop_private.purchase_approval_receipts VALUES (operation,actor,target_purchase_order,previous_status,new_status);
  RETURN 'applied';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_update_purchase_approval(uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_update_purchase_approval(uuid,uuid,uuid,text,text) TO service_role;
