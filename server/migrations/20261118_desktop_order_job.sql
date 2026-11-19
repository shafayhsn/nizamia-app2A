CREATE TABLE IF NOT EXISTS desktop_private.order_job_receipts (
 operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, order_id uuid NOT NULL,
 previous_fields jsonb NOT NULL, new_fields jsonb NOT NULL
);
REVOKE ALL ON desktop_private.order_job_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.order_job_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_update_order_job(
 actor uuid, operation uuid, target_order uuid, previous_fields jsonb, new_fields jsonb
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.order_job_receipts%ROWTYPE;
 target_job public.jobs%ROWTYPE;
BEGIN
 IF actor IS NULL OR operation IS NULL OR target_order IS NULL
    OR coalesce(jsonb_typeof(new_fields),'')<>'object'
    OR coalesce(jsonb_typeof(previous_fields),'')<>'object'
    OR NOT (new_fields ?& ARRAY['job_id','job_number'])
    OR NOT (previous_fields ?& ARRAY['job_id','job_number'])
    OR new_fields - ARRAY['job_id','job_number'] <> '{}'::jsonb
    OR previous_fields - ARRAY['job_id','job_number'] <> '{}'::jsonb
    OR EXISTS(SELECT 1 FROM jsonb_each(new_fields) f WHERE jsonb_typeof(f.value) NOT IN ('string','null'))
    OR ((new_fields->>'job_id' IS NULL) <> (new_fields->>'job_number' IS NULL))
 THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin'
    AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE)
 THEN RETURN 'unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-order-job:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.order_job_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.order_id=target_order AND prior.previous_fields=previous_fields
     AND prior.new_fields=new_fields THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 IF new_fields->>'job_id' IS NOT NULL THEN
  SELECT * INTO target_job FROM public.jobs j WHERE j.id=(new_fields->>'job_id')::uuid FOR SHARE;
  IF NOT FOUND OR target_job.job_number IS DISTINCT FROM new_fields->>'job_number' THEN RETURN 'conflict'; END IF;
 END IF;
 UPDATE public.orders o SET job_id=target_job.id,job_number=target_job.job_number,updated_at=now()
 WHERE o.id=target_order AND to_jsonb(o) @> previous_fields
  AND (target_job.id IS NULL OR o.buyer_id=target_job.buyer_id);
 IF NOT FOUND THEN RETURN 'conflict'; END IF;
 INSERT INTO desktop_private.order_job_receipts VALUES(operation,actor,target_order,previous_fields,new_fields);
 RETURN 'applied';
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow
 OR check_violation OR not_null_violation THEN RETURN 'invalid';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_update_order_job(uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_update_order_job(uuid,uuid,uuid,jsonb,jsonb) TO service_role;
