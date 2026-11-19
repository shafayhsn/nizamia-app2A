-- A receipt is inserted once in the same transaction as a confirmed Mac change.
ALTER TABLE public.app_database_sync_status
 ADD COLUMN IF NOT EXISTS mac_upload_count bigint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS last_mac_upload_at timestamptz;
CREATE OR REPLACE FUNCTION desktop_private.record_mac_upload() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 UPDATE public.app_database_sync_status
 SET mac_upload_count=mac_upload_count+1, last_mac_upload_at=clock_timestamp(), last_saved_at=clock_timestamp()
 WHERE id=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missing sync status row'; END IF;
 RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION desktop_private.record_mac_upload() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION desktop_private.record_mac_upload() TO service_role;
DO $$
DECLARE receipt text;
BEGIN
 FOREACH receipt IN ARRAY ARRAY['sample_stage_receipts','sampling_parcel_receipts','order_note_operations','production_create_receipts'] LOOP
  EXECUTE format('CREATE TRIGGER record_mac_upload AFTER INSERT ON desktop_private.%I FOR EACH ROW EXECUTE FUNCTION desktop_private.record_mac_upload()',receipt);
 END LOOP;
END;
$$;
