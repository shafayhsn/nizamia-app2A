CREATE SCHEMA IF NOT EXISTS desktop_private;
REVOKE ALL ON SCHEMA desktop_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA desktop_private TO service_role;

CREATE TABLE IF NOT EXISTS desktop_private.parcel_transition_receipts (
 operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, parcel_id text NOT NULL, payload jsonb NOT NULL
);
REVOKE ALL ON desktop_private.parcel_transition_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.parcel_transition_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_transition_parcel(
 actor uuid, operation uuid, target_parcel text, payload jsonb
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.parcel_transition_receipts%ROWTYPE;
 current_parcel public.parcels%ROWTYPE;
 next_status text;
 delivery_day date;
 recipient text;
 sample_ids uuid[];
BEGIN
 IF actor IS NULL OR operation IS NULL OR target_parcel IS NULL OR char_length(target_parcel)>128
    OR payload IS NULL OR jsonb_typeof(payload)<>'object' THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin'
  AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE)
 THEN RETURN 'unauthorized'; END IF;
 next_status:=payload->>'status';
 recipient:=nullif(btrim(payload->>'received_by'),'');
 IF next_status IS NULL OR next_status NOT IN ('Dispatched','Delivered') OR char_length(recipient)>200
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) AS k(key)
              WHERE k.key NOT IN ('status','expected_status','expected_updated_at','delivery_date','received_by'))
    OR NOT payload ? 'expected_updated_at' THEN RETURN 'invalid'; END IF;
 IF next_status='Delivered' THEN
  IF coalesce(payload->>'delivery_date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN 'invalid'; END IF;
  BEGIN
   delivery_day:=(payload->>'delivery_date')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN 'invalid';
  END;
  IF delivery_day>(now() AT TIME ZONE 'Asia/Karachi')::date THEN RETURN 'invalid'; END IF;
 END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-parcel:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.parcel_transition_receipts WHERE operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.parcel_id=target_parcel AND prior.payload=payload
  THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;

 SELECT * INTO current_parcel FROM public.parcels p WHERE p.id=target_parcel FOR UPDATE;
 IF NOT FOUND OR current_parcel.status IS DISTINCT FROM payload->>'expected_status'
  OR to_jsonb(current_parcel)->>'updated_at' IS DISTINCT FROM payload->>'expected_updated_at'
  OR current_parcel.status IN ('Delivered','Cancelled') OR current_parcel.status=next_status
 THEN RETURN 'conflict'; END IF;
 IF next_status='Dispatched' AND (current_parcel.status<>'Draft' OR
    nullif(btrim(current_parcel.courier),'') IS NULL OR nullif(btrim(current_parcel.tracking_no),'') IS NULL
    OR current_parcel.dispatch_date IS NULL) THEN RETURN 'conflict'; END IF;
 IF next_status='Delivered' AND (current_parcel.status='Draft' OR delivery_day<current_parcel.dispatch_date)
 THEN RETURN 'conflict'; END IF;
 IF jsonb_typeof(current_parcel.items)<>'array' OR jsonb_array_length(current_parcel.items)>500
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(current_parcel.items) AS x(item)
      WHERE coalesce(x.item->>'sampleId','') !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$')
 THEN RETURN 'conflict'; END IF;
 SELECT coalesce(array_agg(DISTINCT (x.item->>'sampleId')::uuid),ARRAY[]::uuid[]) INTO sample_ids
 FROM jsonb_array_elements(current_parcel.items) AS x(item);
 PERFORM s.id FROM public.samples s WHERE s.id=ANY(sample_ids) ORDER BY s.id FOR UPDATE;
 IF (SELECT count(*) FROM public.samples s WHERE s.id=ANY(sample_ids))<>cardinality(sample_ids)
    OR (next_status='Dispatched' AND EXISTS(SELECT 1 FROM public.samples s
        WHERE s.id=ANY(sample_ids) AND s.dispatch_status='Delivered')) THEN RETURN 'conflict'; END IF;

 UPDATE public.parcels SET status=next_status,updated_at=now(),
  dispatched_at=CASE WHEN next_status='Dispatched' THEN now() ELSE current_parcel.dispatched_at END,
  delivered_at=CASE WHEN next_status='Delivered' THEN delivery_day+time '12:00:00' AT TIME ZONE 'UTC' ELSE current_parcel.delivered_at END,
  received_by=CASE WHEN next_status='Delivered' THEN recipient ELSE current_parcel.received_by END
 WHERE id=target_parcel;
 UPDATE public.samples SET dispatch_status=next_status WHERE id=ANY(sample_ids);
 INSERT INTO public.parcel_status_history(parcel_id,old_status,new_status,note)
 VALUES(target_parcel,current_parcel.status,next_status,
  CASE WHEN delivery_day IS NOT NULL THEN 'Delivered on '||delivery_day::text||
   CASE WHEN recipient IS NOT NULL THEN ' · Received by '||recipient ELSE '' END END);
 INSERT INTO desktop_private.parcel_transition_receipts VALUES(operation,actor,target_parcel,payload);
 RETURN 'applied';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_transition_parcel(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_transition_parcel(uuid,uuid,text,jsonb) TO service_role;
