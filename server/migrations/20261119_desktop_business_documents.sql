CREATE OR REPLACE FUNCTION public.desktop_save_business_document(actor uuid,operation uuid,kind text,verb text,target uuid,payload jsonb,expected jsonb)
RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 receipt desktop_private.operational_receipts%ROWTYPE;
 tab text; old jsonb; prior jsonb:=expected->'before'; doc jsonb; elem jsonb;
 booking text; job text; seq text; st text; lines jsonb; count_ids int;
BEGIN
 IF actor IS NULL OR operation IS NULL OR target IS NULL OR verb IS NULL OR verb NOT IN ('save','delete') OR
 jsonb_typeof(payload) IS DISTINCT FROM 'object' OR jsonb_typeof(expected) IS DISTINCT FROM 'object' THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor AND role='admin' AND is_active IS TRUE AND is_restricted IS NOT TRUE FOR SHARE) THEN RETURN 'unauthorized'; END IF;
 tab:=CASE kind WHEN 'costing' THEN 'costing_sheets' WHEN 'costingAssignment' THEN 'costing_sheets' WHEN 'proforma' THEN 'proforma_invoices'
 WHEN 'meeting' THEN 'pp_meetings' WHEN 'trimPackage' THEN 'bom_presets' END;
 IF tab IS NULL OR verb='delete' AND kind NOT IN ('meeting','trimPackage') THEN RETURN 'invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(operation::text,0));
 SELECT * INTO receipt FROM desktop_private.operational_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF (receipt.actor_id,receipt.kind,receipt.verb,receipt.target,receipt.payload,receipt.expected) IS NOT DISTINCT FROM (actor,kind,verb,target,payload,expected) THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 IF kind<>'costingAssignment' THEN
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id=$1 FOR UPDATE',tab) INTO old USING target;
  IF prior IS DISTINCT FROM coalesce(old,'null'::jsonb) THEN RETURN 'conflict'; END IF;
 END IF;
 IF kind='costingAssignment' THEN
  lines:=expected->'members';
  IF jsonb_typeof(lines) IS DISTINCT FROM 'array' OR jsonb_array_length(lines) NOT BETWEEN 1 AND 500 THEN RETURN 'invalid'; END IF;
  SELECT count(DISTINCT v->>'id') INTO count_ids FROM jsonb_array_elements(lines) v;
  IF count_ids<>jsonb_array_length(lines) THEN RETURN 'invalid'; END IF;
  FOR elem IN SELECT value FROM jsonb_array_elements(lines) ORDER BY value->>'id' LOOP
   SELECT to_jsonb(c) INTO old FROM public.costing_sheets c WHERE id=(elem->>'id')::uuid FOR UPDATE;
   IF old IS NULL OR old->'batch_id' IS DISTINCT FROM elem->'batch_id' THEN RETURN 'conflict'; END IF;
  END LOOP;
  UPDATE public.costing_sheets SET batch_id=(payload->>'batch_id')::uuid WHERE id IN (SELECT (v->>'id')::uuid FROM jsonb_array_elements(lines) v);
 ELSIF kind='costing' THEN
  doc:=payload->'document';
  IF jsonb_typeof(doc) IS DISTINCT FROM 'object' OR coalesce(doc->>'type','') NOT IN ('woven','knits') OR nullif(trim(doc->>'customer'),'') IS NULL THEN RETURN 'invalid'; END IF;
  IF old IS NULL THEN
   INSERT INTO public.costing_sheets(id,type,buyer_id,customer,style,document) VALUES(target,doc->>'type',(payload->>'buyer_id')::uuid,trim(doc->>'customer'),coalesce(doc->>'style',''),doc);
  ELSE
   INSERT INTO public.costing_sheet_versions(costing_id,version,document) VALUES(target,(old->>'version')::int,old->'document');
   UPDATE public.costing_sheets SET buyer_id=(payload->>'buyer_id')::uuid,customer=trim(doc->>'customer'),style=coalesce(doc->>'style',''),document=doc,version=version+1,updated_at=now() WHERE id=target;
  END IF;
 ELSIF kind='proforma' THEN
  IF payload ? 'status' THEN
   st:=payload->>'status';
   IF old IS NULL OR NOT ((old->>'status'='draft' AND st='issued') OR (old->>'status'='issued' AND st IN ('accepted','cancelled'))) OR st IS NULL THEN RETURN 'invalid'; END IF;
   IF st='accepted' AND (nullif(trim(payload->>'emailFrom'),'') IS NULL OR nullif(trim(payload->>'emailReference'),'') IS NULL OR nullif(payload->>'emailDate','') IS NULL) THEN RETURN 'invalid'; END IF;
   UPDATE public.proforma_invoices SET status=st,revision=revision+1,updated_by=actor,updated_at=now(),
    issued_at=CASE WHEN st='issued' THEN now() ELSE issued_at END,
    accepted_at=CASE WHEN st='accepted' THEN now() ELSE accepted_at END,
    cancelled_at=CASE WHEN st='cancelled' THEN now() ELSE cancelled_at END,
    acceptance_email_from=CASE WHEN st='accepted' THEN left(payload->>'emailFrom',320) ELSE acceptance_email_from END,
    acceptance_email_date=CASE WHEN st='accepted' THEN (payload->>'emailDate')::date ELSE acceptance_email_date END,
    acceptance_email_reference=CASE WHEN st='accepted' THEN left(payload->>'emailReference',1000) ELSE acceptance_email_reference END WHERE id=target;
  ELSE
   doc:=payload->'snapshot'; lines:=doc->'lines';
   IF old IS NOT NULL AND old->>'status'<>'draft' OR jsonb_typeof(lines) IS DISTINCT FROM 'array' OR jsonb_array_length(lines) NOT BETWEEN 1 AND 500 OR
    nullif(doc#>>'{buyer,id}','') IS NULL OR nullif(trim(doc#>>'{form,terms}'),'') IS NULL OR nullif(trim(doc#>>'{form,paymentTerms}'),'') IS NULL OR nullif(doc#>>'{form,shipmentDate}','') IS NULL OR
    EXISTS(SELECT FROM jsonb_array_elements(lines) l WHERE coalesce((l->>'total_qty')::numeric,0)<=0 OR coalesce((l->>'total_value_usd')::numeric,-1)<0) THEN RETURN 'invalid'; END IF;
   IF old IS NULL THEN
    SELECT CASE count(DISTINCT trim(l->>'job_number')) WHEN 0 THEN 'PREORDER' WHEN 1 THEN min(trim(l->>'job_number')) ELSE 'MULTI' END INTO job FROM jsonb_array_elements(lines) l WHERE nullif(trim(l->>'job_number'),'') IS NOT NULL;
    SELECT public.allocate_proforma_number()::text INTO seq;
    booking:='PI-'||left(regexp_replace(job,'[^A-Za-z0-9-]','','g'),40)||'-'||regexp_replace(seq,'^.*-','');
    doc:=jsonb_set(doc,'{form,number}',to_jsonb(booking));
    INSERT INTO public.proforma_invoices(id,pi_number,buyer_id,snapshot,status,created_by,updated_by) VALUES(target,booking,(doc#>>'{buyer,id}')::uuid,doc,'draft',actor,actor);
   ELSE
    doc:=jsonb_set(doc,'{form,number}',old->'pi_number');
    UPDATE public.proforma_invoices SET buyer_id=(doc#>>'{buyer,id}')::uuid,snapshot=doc,revision=revision+1,updated_by=actor,updated_at=now() WHERE id=target;
   END IF;
  END IF;
 ELSIF kind='meeting' THEN
  IF verb='delete' THEN
   IF old IS NULL OR old->>'status'<>'Draft' OR coalesce(old->>'outstanding_actions','')<>'' OR (old->>'attachment_path') IS NOT NULL OR (old->>'meeting_date') IS NOT NULL OR
    (old->>'decision') IS NOT NULL OR (old->>'fit_approved') IS NOT NULL OR jsonb_path_exists(old->'technical_checks','$.* ? (@ == true)') OR
    EXISTS(SELECT FROM jsonb_each(old->'department_notes') n CROSS JOIN LATERAL jsonb_each_text(n.value) v WHERE trim(v.value)<>'') OR coalesce(old->'signatures','{}')<>'{}' THEN RETURN 'invalid'; END IF;
   DELETE FROM public.pp_meetings WHERE id=target;
  ELSE
   IF old IS NOT NULL THEN RETURN 'invalid'; END IF;
   INSERT INTO public.pp_meetings(id,order_id,created_by) VALUES(target,(payload->>'order_id')::uuid,actor);
  END IF;
 ELSE
  LOCK TABLE public.bom_preset_items IN SHARE ROW EXCLUSIVE MODE;
  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]') INTO lines FROM public.bom_preset_items i WHERE preset_id=target;
  IF lines IS DISTINCT FROM expected->'lines' THEN RETURN 'conflict'; END IF;
  IF verb='delete' THEN
   IF old IS NULL THEN RETURN 'invalid'; END IF;
   DELETE FROM public.bom_preset_items WHERE preset_id=target;
   DELETE FROM public.bom_presets WHERE id=target;
  ELSE
   lines:=payload->'lines';
   IF nullif(trim(payload->>'name'),'') IS NULL OR jsonb_typeof(lines) IS DISTINCT FROM 'array' OR jsonb_array_length(lines) NOT BETWEEN 1 AND 500 OR
    (SELECT count(DISTINCT v->>'library_item_id') FROM jsonb_array_elements(lines) v)<>jsonb_array_length(lines) OR
    EXISTS(SELECT FROM jsonb_array_elements(lines) v WHERE NOT EXISTS(SELECT FROM public.library_items i WHERE i.id=(v->>'library_item_id')::uuid AND i.category IN ('Packing Trim','Stitching Trim'))) THEN RETURN 'invalid'; END IF;
   IF old IS NULL THEN INSERT INTO public.bom_presets(id,name,buyer_id) VALUES(target,payload->>'name',(payload->>'buyer_id')::uuid);
   ELSE UPDATE public.bom_presets SET name=payload->>'name',buyer_id=(payload->>'buyer_id')::uuid WHERE id=target; END IF;
   DELETE FROM public.bom_preset_items i WHERE i.preset_id=target AND NOT EXISTS(SELECT FROM jsonb_array_elements(lines) v WHERE (v->>'id')::uuid=i.id AND (v->>'library_item_id')::uuid=i.library_item_id);
   INSERT INTO public.bom_preset_items(id,preset_id,library_item_id) SELECT (v->>'id')::uuid,target,(v->>'library_item_id')::uuid FROM jsonb_array_elements(lines) v WHERE NOT EXISTS(SELECT FROM public.bom_preset_items i WHERE i.id=(v->>'id')::uuid AND i.preset_id=target AND i.library_item_id=(v->>'library_item_id')::uuid);
  END IF;
 END IF;
 INSERT INTO desktop_private.operational_receipts VALUES(operation,actor,kind,verb,target,payload,expected);
 RETURN 'applied';
EXCEPTION WHEN unique_violation OR foreign_key_violation THEN RETURN 'conflict';
 WHEN data_exception OR check_violation OR not_null_violation THEN RETURN 'invalid';
END $$;
REVOKE ALL ON FUNCTION public.desktop_save_business_document(uuid,uuid,text,text,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_save_business_document(uuid,uuid,text,text,uuid,jsonb,jsonb) TO service_role;
