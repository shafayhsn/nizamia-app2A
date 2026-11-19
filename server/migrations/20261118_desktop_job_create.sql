CREATE TABLE IF NOT EXISTS desktop_private.job_create_receipts (
 operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, buyer_id uuid NOT NULL, expected_orders jsonb NOT NULL
);
REVOKE ALL ON desktop_private.job_create_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.job_create_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_create_and_assign_job(
 actor uuid, operation uuid, target_buyer uuid, expected_orders jsonb
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.job_create_receipts%ROWTYPE;
 config public.document_numbering%ROWTYPE;
 pattern text;
 number text;
 seq integer;
 pad integer;
 seq_text text;
 changed integer;
 today date:=(now() AT TIME ZONE 'Asia/Karachi')::date;
BEGIN
 IF actor IS NULL OR operation IS NULL OR target_buyer IS NULL
    OR coalesce(jsonb_typeof(expected_orders),'')<>'array'
    OR jsonb_array_length(expected_orders) NOT BETWEEN 1 AND 500
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(expected_orders) item
      WHERE NOT (item ?& ARRAY['id','job_id','job_number']) OR item->>'id' IS NULL
       OR item - ARRAY['id','job_id','job_number'] <> '{}'::jsonb)
    OR (SELECT count(DISTINCT (item->>'id')::uuid) FROM jsonb_array_elements(expected_orders) item)<>jsonb_array_length(expected_orders)
 THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin'
    AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE)
 THEN RETURN 'unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-job-create:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.job_create_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.buyer_id=target_buyer AND prior.expected_orders=expected_orders THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 PERFORM o.id FROM public.orders o JOIN jsonb_array_elements(expected_orders) item ON o.id=(item->>'id')::uuid
 WHERE o.buyer_id=target_buyer AND to_jsonb(o) @> item ORDER BY o.id FOR UPDATE OF o;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>jsonb_array_length(expected_orders) THEN RETURN 'conflict'; END IF;
 INSERT INTO public.document_numbering(doc_type,label,prefix,pattern,seq_pad,next_number,enabled)
 VALUES('job','Job Number','NZ-26','{PREFIX}{SEQ}',2,1,true)
 ON CONFLICT(doc_type) DO NOTHING;
 SELECT * INTO config FROM public.document_numbering d WHERE d.doc_type='job' FOR UPDATE;
 IF NOT FOUND OR config.enabled IS FALSE THEN RETURN 'conflict'; END IF;
 pattern:=coalesce(nullif(config.pattern,''),nullif(config.format,''),'{PREFIX}-{YY}{SEASON}-{SEQ}');
 IF (position('{SEQ}' in pattern)=0 AND pattern !~ '#+') OR char_length(pattern)>100
 THEN RETURN 'invalid'; END IF;
 pad:=greatest(1,least(coalesce(config.seq_pad,length(substring(pattern from '#+')),2),15));
 seq:=greatest(1,coalesce(config.next_number,config.current_number,1));

 FOR attempt IN 1..500 LOOP
  seq_text:=lpad(seq::text,greatest(pad,length(seq::text)),'0');
  IF position('{' in pattern)>0 THEN
   number:=replace(replace(replace(replace(replace(replace(pattern,'{PREFIX}',coalesce(config.prefix,'')),
    '{YY}',to_char(today,'YY')),'{YYYY}',to_char(today,'YYYY')),'{MM}',to_char(today,'MM')),
    '{SEASON}',CASE WHEN extract(month from today)<=6 THEN '01' ELSE '02' END),'{SEQ}',seq_text);
  ELSE
   number:=replace(replace(replace(regexp_replace(replace(pattern,'PREFIX',coalesce(config.prefix,'')),'#+',seq_text),
    'YYYY',to_char(today,'YYYY')),'YY',to_char(today,'YY')),'MM',to_char(today,'MM'));
  END IF;
  INSERT INTO public.jobs(id,buyer_id,job_number) VALUES(operation,target_buyer,number)
  ON CONFLICT(job_number) DO NOTHING;
  IF FOUND THEN EXIT; END IF;
  IF attempt=500 THEN RETURN 'conflict'; END IF;
  seq:=seq+1;
 END LOOP;
 UPDATE public.orders o SET job_id=operation,job_number=number,updated_at=now()
 FROM jsonb_array_elements(expected_orders) item WHERE o.id=(item->>'id')::uuid;
 UPDATE public.document_numbering SET next_number=seq+1,current_number=seq+1,updated_at=now() WHERE doc_type='job';
 INSERT INTO desktop_private.job_create_receipts VALUES(operation,actor,target_buyer,expected_orders);
 RETURN 'applied';
EXCEPTION WHEN invalid_text_representation OR check_violation OR not_null_violation OR numeric_value_out_of_range THEN RETURN 'invalid';
 WHEN foreign_key_violation OR unique_violation THEN RETURN 'conflict';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_create_and_assign_job(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_create_and_assign_job(uuid,uuid,uuid,jsonb) TO service_role;
