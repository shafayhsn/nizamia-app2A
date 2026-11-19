CREATE TABLE IF NOT EXISTS desktop_private.order_copy_receipts (
 operation_id uuid PRIMARY KEY,actor_id uuid NOT NULL,source_order uuid NOT NULL,target_order uuid NOT NULL,sections jsonb NOT NULL
);
REVOKE ALL ON desktop_private.order_copy_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.order_copy_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_copy_order_sections(
 actor uuid,operation uuid,source_order uuid,target_order uuid,sections jsonb
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.order_copy_receipts%ROWTYPE;
 table_name text;
 flag text;
 entry jsonb;
 columns text;
 values_sql text;
 found_count integer;
 finishing_id uuid;
 seq integer;
 yy text:=to_char(now() AT TIME ZONE 'Asia/Karachi','YY');
 sample_no text;
BEGIN
 IF actor IS NULL OR operation IS NULL OR source_order IS NULL OR target_order IS NULL OR source_order=target_order
  OR coalesce(jsonb_typeof(sections),'')<>'object' OR sections='{}'::jsonb
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(sections) k WHERE k NOT IN
    ('bom_items','fitting_blocks','samples','washing','embellishments','finishing','finishing_packs','order_processes'))
  OR (sections ? 'finishing_packs' AND NOT sections ? 'finishing')
 THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin' AND u.is_active IS TRUE
   AND u.is_restricted IS NOT TRUE FOR SHARE) THEN RETURN 'unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-order-copy:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.order_copy_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.source_order=source_order AND prior.target_order=target_order AND prior.sections=sections
   THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 PERFORM id FROM public.orders WHERE id IN(source_order,target_order) ORDER BY id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.orders a JOIN public.orders b ON a.buyer_id=b.buyer_id AND a.style_number=b.style_number
   WHERE a.id=source_order AND b.id=target_order) THEN RETURN 'conflict'; END IF;
 IF sections ? 'finishing' THEN
  IF jsonb_typeof(sections->'finishing')<>'array' OR jsonb_array_length(sections->'finishing')<>1 THEN RETURN 'invalid'; END IF;
  finishing_id:=(sections->'finishing'->0->>'id')::uuid;
 END IF;
 FOREACH table_name IN ARRAY ARRAY['bom_items','fitting_blocks','samples','washing','embellishments','finishing','finishing_packs','order_processes'] LOOP
  IF NOT sections ? table_name THEN CONTINUE; END IF;
  IF coalesce(jsonb_typeof(sections->table_name),'')<>'array' OR jsonb_array_length(sections->table_name)>300
   OR (table_name<>'finishing_packs' AND jsonb_array_length(sections->table_name)=0) THEN RAISE check_violation USING MESSAGE='Invalid copy section'; END IF;
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',table_name);
  EXECUTE format('SELECT count(*) FROM public.%I WHERE order_id=$1',table_name) INTO found_count USING target_order;
  IF found_count<>0 THEN RAISE foreign_key_violation USING MESSAGE='Destination section already exists'; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(sections->table_name) LOOP
   IF jsonb_typeof(entry)<>'object' OR (entry->>'order_id')::uuid IS DISTINCT FROM target_order
    OR NULLIF(entry->>'id','') IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(entry) k WHERE k IN ('created_at','updated_at')
     OR NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=format('public.%I',table_name)::regclass
      AND a.attname=k AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='' AND a.attidentity=''))
   THEN RAISE check_violation USING MESSAGE='Invalid copied row'; END IF;
   IF table_name='samples' THEN
    IF entry ?| ARRAY['parent_sample_id','root_sample_id','last_comment_at','last_comment_by']
     OR (entry->>'size_group_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.size_groups g
      WHERE g.id=(entry->>'size_group_id')::uuid AND g.order_id=target_order FOR SHARE))
     THEN RAISE foreign_key_violation USING MESSAGE='Invalid copied sample links'; END IF;
    FOR attempt IN 1..20 LOOP
     INSERT INTO public.counters AS c(key,value) VALUES('sam_'||yy,1)
      ON CONFLICT(key) DO UPDATE SET value=c.value+1 RETURNING value INTO seq;
     IF coalesce(seq,0)<1 THEN RAISE check_violation USING MESSAGE='Sample number unavailable'; END IF;
     sample_no:='SAM-'||yy||lpad(seq::text,greatest(2,length(seq::text)),'0');
     EXIT WHEN NOT EXISTS(SELECT 1 FROM public.samples WHERE sample_number=sample_no);
     IF attempt=20 THEN RAISE unique_violation USING MESSAGE='No available sample number'; END IF;
    END LOOP;
    entry:=jsonb_set(entry,'{sample_number}',to_jsonb(sample_no));
   ELSIF table_name='washing' AND entry->>'color_id' IS NOT NULL AND NOT EXISTS(
     SELECT 1 FROM public.size_group_colors c JOIN public.size_groups g ON g.id=c.size_group_id
     WHERE c.id=(entry->>'color_id')::uuid AND g.order_id=target_order FOR SHARE OF c,g)
    THEN RAISE foreign_key_violation USING MESSAGE='Invalid copied Washing colour';
   ELSIF table_name='finishing_packs' THEN
    IF (entry->>'finishing_id')::uuid IS DISTINCT FROM finishing_id OR (
      coalesce(entry->>'packing_basis',entry->>'pack_type')='By Q#'
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(entry->'config'->'lines')='array'
       THEN entry->'config'->'lines' ELSE '[]'::jsonb END) line
       WHERE NOT EXISTS(SELECT 1 FROM public.order_queues q WHERE q.order_id=target_order AND q.id::text=line->>'key')))
     THEN RAISE foreign_key_violation USING MESSAGE='Invalid copied packing links'; END IF;
   END IF;
   SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('r.%I',k),',' ORDER BY k)
    INTO columns,values_sql FROM jsonb_object_keys(entry) k;
   EXECUTE format('INSERT INTO public.%I(%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) r',
     table_name,columns,values_sql,table_name) USING entry;
  END LOOP;
  flag:=CASE table_name
   WHEN 'bom_items' THEN 'step_bom' WHEN 'fitting_blocks' THEN 'step_fitting'
   WHEN 'samples' THEN 'step_sampling' WHEN 'washing' THEN 'step_washing'
   WHEN 'embellishments' THEN 'step_embellishment' WHEN 'finishing' THEN 'step_finishing'
   WHEN 'order_processes' THEN 'step_processes' ELSE NULL END;
  IF flag IS NOT NULL THEN EXECUTE format('UPDATE public.orders SET %I=true WHERE id=$1',flag) USING target_order; END IF;
 END LOOP;
 INSERT INTO desktop_private.order_copy_receipts VALUES(operation,actor,source_order,target_order,sections);
 RETURN 'applied';
EXCEPTION WHEN foreign_key_violation OR unique_violation THEN RETURN 'conflict';
 WHEN invalid_text_representation OR check_violation OR not_null_violation OR numeric_value_out_of_range THEN RETURN 'invalid';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_copy_order_sections(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_copy_order_sections(uuid,uuid,uuid,uuid,jsonb) TO service_role;
