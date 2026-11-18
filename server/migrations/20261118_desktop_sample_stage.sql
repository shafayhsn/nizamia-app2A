CREATE SCHEMA IF NOT EXISTS desktop_private;
REVOKE ALL ON SCHEMA desktop_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA desktop_private TO service_role;

CREATE TABLE IF NOT EXISTS desktop_private.sample_stage_receipts (
 operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, sample_id uuid NOT NULL,
 previous_stage text, new_stage text NOT NULL
);
REVOKE ALL ON desktop_private.sample_stage_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.sample_stage_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_update_sample_stage(
 actor uuid, operation uuid, target_sample uuid, previous_stage text, new_stage text
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.sample_stage_receipts%ROWTYPE;
 changed public.samples%ROWTYPE;
BEGIN
 IF actor IS NULL OR operation IS NULL OR target_sample IS NULL OR new_stage IS NULL
    OR new_stage NOT IN ('Not Started','Pattern','Cutting','Stitching','Washing','Finishing','Ready')
 THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin'
    AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE)
 THEN RETURN 'unauthorized'; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-sample-stage:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.sample_stage_receipts WHERE operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.sample_id=target_sample AND prior.previous_stage IS NOT DISTINCT FROM previous_stage
     AND prior.new_stage=new_stage THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 UPDATE public.samples AS s SET stage=new_stage
 WHERE s.id=target_sample AND s.stage IS NOT DISTINCT FROM previous_stage
 RETURNING s.* INTO changed;
 IF NOT FOUND THEN RETURN 'conflict'; END IF;
 INSERT INTO public.sample_comments(id,sample_id,root_sample_id,sam_number,version_label,comment_type,
     comment_text,comment_date,is_internal)
 VALUES(operation,changed.id,coalesce(changed.root_sample_id,changed.id),changed.sample_number,
     coalesce(changed.version_label,'V1'),'Stage',coalesce(previous_stage,'Not Started')||' → '||new_stage,now(),true);
 INSERT INTO desktop_private.sample_stage_receipts VALUES(operation,actor,target_sample,previous_stage,new_stage);
 RETURN 'applied';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_update_sample_stage(uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_update_sample_stage(uuid,uuid,uuid,text,text) TO service_role;
