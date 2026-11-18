CREATE SCHEMA IF NOT EXISTS desktop_private;
REVOKE ALL ON SCHEMA desktop_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA desktop_private TO service_role;

CREATE TABLE IF NOT EXISTS desktop_private.shipment_status_receipts (
 operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, shipment_id uuid NOT NULL, payload_hash bytea NOT NULL
);
REVOKE ALL ON desktop_private.shipment_status_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.shipment_status_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_update_shipment_status(
 actor uuid, operation uuid, target_shipment uuid, previous_notes text, next_notes text
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.shipment_status_receipts%ROWTYPE;
 payload_hash bytea;
BEGIN
 IF actor IS NULL OR operation IS NULL OR target_shipment IS NULL OR next_notes IS NULL
    OR octet_length(next_notes)>56000 THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin'
   AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE)
 THEN RETURN 'unauthorized'; END IF;
 payload_hash:=sha256(convert_to(jsonb_build_array(previous_notes,next_notes)::text,'UTF8'));
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-shipment-status:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.shipment_status_receipts WHERE operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.shipment_id=target_shipment AND prior.payload_hash=payload_hash
  THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 UPDATE public.shipments AS s SET notes=next_notes
 WHERE s.id=target_shipment AND s.notes IS NOT DISTINCT FROM previous_notes;
 IF NOT FOUND THEN RETURN 'conflict'; END IF;
 INSERT INTO desktop_private.shipment_status_receipts VALUES(operation,actor,target_shipment,payload_hash);
 RETURN 'applied';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_update_shipment_status(uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_update_shipment_status(uuid,uuid,uuid,text,text) TO service_role;
