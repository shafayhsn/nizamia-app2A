-- Apply only after reviewing deployment environment and backup policy.
-- Never run automatically against the live CP-17 database.
CREATE TABLE IF NOT EXISTS offline_sync_operations (
  operation_id varchar(64) PRIMARY KEY,
  outcome varchar(24) NOT NULL CHECK (outcome = 'applied'),
  applied_at timestamptz NOT NULL DEFAULT now()
);
-- Restrict direct client access; only the trusted server transaction role
-- should have read/write privileges on this ledger.

CREATE SCHEMA IF NOT EXISTS desktop_private;
REVOKE ALL ON SCHEMA desktop_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA desktop_private TO service_role;

CREATE TABLE IF NOT EXISTS desktop_private.order_note_operations (
  operation_id text PRIMARY KEY CHECK (operation_id ~ '^[a-f0-9]{64}$'),
  actor_id uuid NOT NULL,
  target_id uuid NOT NULL,
  payload_hash bytea NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON desktop_private.order_note_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.order_note_operations TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_apply_order_note(
  actor uuid, operation text, order_id uuid, previous_note text, new_note text
) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  request_hash bytea;
  prior desktop_private.order_note_operations%ROWTYPE;
BEGIN
  IF actor IS NULL OR operation IS NULL OR operation !~ '^[a-f0-9]{64}$'
    OR order_id IS NULL OR new_note IS NULL OR char_length(new_note) > 2000 THEN
    RAISE EXCEPTION 'Invalid desktop order note operation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = actor AND u.role = 'admin' AND u.is_active IS TRUE
      AND u.is_restricted IS NOT TRUE
    FOR SHARE
  ) THEN
    RETURN 'unauthorized';
  END IF;
  request_hash := pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array(previous_note,new_note)::text,'UTF8'
  ));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(operation,0));
  SELECT * INTO prior FROM desktop_private.order_note_operations WHERE operation_id = operation;
  IF FOUND THEN
    IF prior.actor_id = actor AND prior.target_id = order_id AND prior.payload_hash = request_hash THEN
      RETURN 'already-applied';
    END IF;
    RETURN 'conflict';
  END IF;
  UPDATE public.orders SET notes = new_note
  WHERE id = order_id AND notes IS NOT DISTINCT FROM previous_note;
  IF NOT FOUND THEN
    RETURN 'conflict';
  END IF;
  INSERT INTO desktop_private.order_note_operations(operation_id,actor_id,target_id,payload_hash)
  VALUES (operation,actor,order_id,request_hash);
  RETURN 'applied';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_apply_order_note(uuid,text,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_apply_order_note(uuid,text,uuid,text,text) TO service_role;
ALTER TABLE public.offline_sync_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.offline_sync_operations FROM PUBLIC, anon, authenticated;
