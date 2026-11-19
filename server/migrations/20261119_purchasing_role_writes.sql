CREATE OR REPLACE FUNCTION public.desktop_create_purchasing_document(
 actor uuid, operation uuid, kind text, header jsonb, lines jsonb
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.purchasing_create_receipts%ROWTYPE;
 po public.purchase_orders%ROWTYPE;
 wo public.work_orders%ROWTYPE;
 config public.document_numbering%ROWTYPE;
 payload jsonb;
 series text;
 pattern text;
 number text;
 seq integer;
 pad integer;
 seq_text text;
 today date:=(now() AT TIME ZONE 'Asia/Karachi')::date;
BEGIN
 IF actor IS NULL OR operation IS NULL OR kind IS NULL OR kind NOT IN ('purchase_orders','work_orders')
    OR coalesce(jsonb_typeof(header),'')<>'object' OR coalesce(jsonb_typeof(lines),'')<>'array'
    OR jsonb_array_length(lines) NOT BETWEEN 1 AND 200 THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND (u.role='admin' OR (kind='purchase_orders' AND EXISTS (
      SELECT 1 FROM public.permissions p WHERE p.role_id=u.role_id AND p.module='purchasing'
        AND p.can_view IS TRUE AND p.can_create IS TRUE)))
    AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE)
 THEN RETURN 'unauthorized'; END IF;
 IF kind='purchase_orders' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(header) k(name) WHERE k.name NOT IN
   ('order_id','supplier_id','po_date','delivery_date','currency','payment_terms','status','notes'))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(lines) x(value)
    WHERE jsonb_typeof(x.value)<>'object' OR nullif(btrim(x.value->>'description'),'') IS NULL)
   THEN RETURN 'invalid'; END IF;
  po:=jsonb_populate_record(NULL::public.purchase_orders,header);
  IF po.supplier_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.suppliers s WHERE s.id=po.supplier_id FOR SHARE)
     OR (po.order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.id=po.order_id FOR SHARE))
  THEN RETURN 'conflict'; END IF;
  series:='po';
 ELSE
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(header) k(name) WHERE k.name NOT IN
    ('order_id','vendor_id','vendor_type','vendor_phone','factory_ref','issue_date','start_date','complete_by','daily_output','payment_terms','color','qty','status','notes'))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(lines) x(value)
     WHERE jsonb_typeof(x.value)<>'object' OR nullif(btrim(x.value->>'process_name'),'') IS NULL)
   THEN RETURN 'invalid'; END IF;
  wo:=jsonb_populate_record(NULL::public.work_orders,header);
  IF wo.vendor_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.suppliers s WHERE s.id=wo.vendor_id FOR SHARE)
     OR (wo.order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.id=wo.order_id FOR SHARE))
  THEN RETURN 'conflict'; END IF;
  series:='wo';
 END IF;
 IF coalesce(header->>'status','Draft')<>'Draft' THEN RETURN 'invalid'; END IF;

 payload:=jsonb_build_array(header,lines);
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-purchasing:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.purchasing_create_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.kind=kind AND prior.payload=payload THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 SELECT * INTO config FROM public.document_numbering d WHERE d.doc_type=series FOR UPDATE;
 IF NOT FOUND OR config.enabled IS FALSE THEN RETURN 'conflict'; END IF;
 pattern:=coalesce(nullif(config.pattern,''),nullif(config.format,''),'{PREFIX}-{YY}{SEASON}-{SEQ}');
 IF (position('{SEQ}' in pattern)=0 AND pattern !~ '#+') OR char_length(pattern)>100
 THEN RETURN 'invalid'; END IF;
 pad:=greatest(1,least(coalesce(config.seq_pad,length(substring(pattern from '#+')),3),15));
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
  IF kind='purchase_orders' THEN
   INSERT INTO public.purchase_orders(id,po_number,order_id,supplier_id,po_date,delivery_date,currency,payment_terms,status,notes)
   VALUES(operation,number,po.order_id,po.supplier_id,po.po_date,po.delivery_date,po.currency,po.payment_terms,'Draft',po.notes)
   ON CONFLICT(po_number) DO NOTHING;
  ELSE
   INSERT INTO public.work_orders(id,wo_number,order_id,vendor_id,vendor_type,vendor_phone,factory_ref,
    issue_date,start_date,complete_by,daily_output,payment_terms,color,qty,status,notes)
   VALUES(operation,number,wo.order_id,wo.vendor_id,wo.vendor_type,wo.vendor_phone,wo.factory_ref,
    wo.issue_date,wo.start_date,wo.complete_by,wo.daily_output,wo.payment_terms,wo.color,wo.qty,'Draft',wo.notes)
   ON CONFLICT(wo_number) DO NOTHING;
  END IF;
  IF FOUND THEN EXIT; END IF;
  IF attempt=500 THEN RETURN 'conflict'; END IF;
  seq:=seq+1;
 END LOOP;
 IF kind='purchase_orders' THEN
  INSERT INTO public.purchase_order_items(po_id,description,specification,qty,unit,unit_rate,amount,sort_order,source_type,source_id)
  SELECT operation,i.description,i.specification,i.qty,i.unit,i.unit_rate,round(i.qty*i.unit_rate,2),i.sort_order,i.source_type,i.source_id
  FROM jsonb_populate_recordset(NULL::public.purchase_order_items,lines) i;
 ELSE
  IF EXISTS(SELECT 1 FROM jsonb_populate_recordset(NULL::public.work_order_items,lines) i
    WHERE i.order_process_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.order_processes p
     WHERE p.id=i.order_process_id AND p.order_id=wo.order_id))
  THEN RAISE check_violation USING MESSAGE='Invalid work order process'; END IF;
  INSERT INTO public.work_order_items(wo_id,order_process_id,process_name,dept_info,qty,unit,rate,amount,sort_order)
  SELECT operation,i.order_process_id,i.process_name,i.dept_info,i.qty,i.unit,i.rate,round(i.qty*i.rate,2),i.sort_order
  FROM jsonb_populate_recordset(NULL::public.work_order_items,lines) i;
 END IF;
 UPDATE public.document_numbering SET next_number=seq+1,current_number=seq+1,updated_at=now() WHERE doc_type=series;
 INSERT INTO desktop_private.purchasing_create_receipts VALUES(operation,actor,kind,payload);
 RETURN 'applied';
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow
 OR check_violation OR not_null_violation OR numeric_value_out_of_range THEN RETURN 'invalid';
 WHEN foreign_key_violation OR unique_violation THEN RETURN 'conflict';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_create_purchasing_document(uuid,uuid,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_create_purchasing_document(uuid,uuid,text,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_edit_purchasing_document(
 actor uuid, operation uuid, kind text, target uuid, header jsonb, expected jsonb, lines jsonb
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.purchasing_create_receipts%ROWTYPE;
 po public.purchase_orders%ROWTYPE;
 wo public.work_orders%ROWTYPE;
 payload jsonb:=jsonb_build_array(target,header,expected,lines);
 observed timestamptz;
 current_lines jsonb;
 observed_header jsonb;
BEGIN
 IF actor IS NULL OR operation IS NULL OR target IS NULL OR kind IS NULL OR kind NOT IN ('purchase_orders','work_orders')
    OR coalesce(jsonb_typeof(header),'')<>'object' OR coalesce(jsonb_typeof(lines),'')<>'array'
    OR coalesce(jsonb_typeof(expected->'header'),'')<>'object'
    OR coalesce(jsonb_typeof(expected->'lines'),'')<>'array' OR expected->>'updated_at' IS NULL
    OR jsonb_array_length(lines) NOT BETWEEN 1 AND 200 THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND (u.role='admin' OR (kind='purchase_orders' AND EXISTS (
      SELECT 1 FROM public.permissions p WHERE p.role_id=u.role_id AND p.module='purchasing'
        AND p.can_view IS TRUE AND p.can_edit IS TRUE)))
    AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE)
 THEN RETURN 'unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-purchasing:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.purchasing_create_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.kind=kind AND prior.payload=payload THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 IF kind='purchase_orders' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(header) k(name) WHERE k.name NOT IN
   ('order_id','supplier_id','po_date','delivery_date','currency','payment_terms','status','notes'))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(lines) x(value)
    WHERE jsonb_typeof(x.value)<>'object' OR nullif(btrim(x.value->>'description'),'') IS NULL)
   THEN RETURN 'invalid'; END IF;
  po:=jsonb_populate_record(NULL::public.purchase_orders,header);
  IF po.supplier_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.suppliers s WHERE s.id=po.supplier_id FOR SHARE)
     OR (po.order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.id=po.order_id FOR SHARE))
  THEN RETURN 'conflict'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(header) k(name) WHERE k.name NOT IN
    ('order_id','vendor_id','vendor_type','vendor_phone','factory_ref','issue_date','start_date','complete_by','daily_output','payment_terms','color','qty','status','notes'))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(lines) x(value)
     WHERE jsonb_typeof(x.value)<>'object' OR nullif(btrim(x.value->>'process_name'),'') IS NULL)
   THEN RETURN 'invalid'; END IF;
  wo:=jsonb_populate_record(NULL::public.work_orders,header);
  IF wo.vendor_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.suppliers s WHERE s.id=wo.vendor_id FOR SHARE)
     OR (wo.order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.id=wo.order_id FOR SHARE))
  THEN RETURN 'conflict'; END IF;
 END IF;

 IF kind='purchase_orders' THEN
  SELECT p.updated_at,to_jsonb(p) INTO observed,observed_header FROM public.purchase_orders p WHERE p.id=target FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor AND role='admin') AND NOT EXISTS(
    SELECT 1 FROM public.read_purchase_order_page(actor,NULL,target) v WHERE (v.document->>'approval_verified')::boolean
  ) THEN RETURN 'unauthorized'; END IF;
  -- Changing PO content always creates a draft. Approval is a separate action.
  IF po.status IS DISTINCT FROM 'Draft' THEN RETURN 'invalid'; END IF;
  PERFORM 1 FROM public.purchase_order_items i WHERE i.po_id=target FOR UPDATE;
  SELECT coalesce(jsonb_agg(to_jsonb(i)),'[]') INTO current_lines FROM public.purchase_order_items i WHERE i.po_id=target;
 ELSE
  SELECT w.updated_at,to_jsonb(w) INTO observed,observed_header FROM public.work_orders w WHERE w.id=target FOR UPDATE;
  PERFORM 1 FROM public.work_order_items i WHERE i.wo_id=target FOR UPDATE;
  SELECT coalesce(jsonb_agg(to_jsonb(i)),'[]') INTO current_lines FROM public.work_order_items i WHERE i.wo_id=target;
 END IF;
 IF observed IS DISTINCT FROM (expected->>'updated_at')::timestamptz
    OR NOT observed_header @> (expected->'header')
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(header) k(name) WHERE NOT (expected->'header') ? k.name)
    OR NOT (current_lines @> (expected->'lines') AND current_lines <@ (expected->'lines')) THEN RETURN 'conflict'; END IF;
 IF kind='purchase_orders' THEN
  UPDATE public.purchase_orders SET order_id=po.order_id,supplier_id=po.supplier_id,po_date=po.po_date,
    delivery_date=po.delivery_date,currency=po.currency,payment_terms=po.payment_terms,status=po.status,notes=po.notes,
    updated_at=now() WHERE id=target;
  DELETE FROM public.purchase_order_items WHERE po_id=target;
 ELSE
  UPDATE public.work_orders SET order_id=wo.order_id,vendor_id=wo.vendor_id,vendor_type=wo.vendor_type,vendor_phone=wo.vendor_phone,
    factory_ref=wo.factory_ref,issue_date=wo.issue_date,start_date=wo.start_date,complete_by=wo.complete_by,daily_output=wo.daily_output,
    payment_terms=wo.payment_terms,color=wo.color,qty=wo.qty,status=wo.status,notes=wo.notes,updated_at=now() WHERE id=target;
  DELETE FROM public.work_order_items WHERE wo_id=target;
 END IF;
 IF kind='purchase_orders' THEN
  INSERT INTO public.purchase_order_items(id,po_id,description,specification,qty,unit,unit_rate,amount,sort_order,source_type,source_id)
  SELECT i.id,target,i.description,i.specification,i.qty,i.unit,i.unit_rate,round(i.qty*i.unit_rate,2),i.sort_order,i.source_type,i.source_id
  FROM jsonb_populate_recordset(NULL::public.purchase_order_items,lines) i;
 ELSE
  IF EXISTS(SELECT 1 FROM jsonb_populate_recordset(NULL::public.work_order_items,lines) i
    WHERE i.order_process_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.order_processes p
     WHERE p.id=i.order_process_id AND p.order_id=wo.order_id))
  THEN RAISE check_violation USING MESSAGE='Invalid work order process'; END IF;
  INSERT INTO public.work_order_items(id,wo_id,order_process_id,process_name,dept_info,qty,unit,rate,amount,sort_order)
  SELECT i.id,target,i.order_process_id,i.process_name,i.dept_info,i.qty,i.unit,i.rate,round(i.qty*i.rate,2),i.sort_order
  FROM jsonb_populate_recordset(NULL::public.work_order_items,lines) i;
 END IF;

 INSERT INTO desktop_private.purchasing_create_receipts VALUES(operation,actor,kind,payload);
 RETURN 'applied';
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow
 OR check_violation OR not_null_violation OR numeric_value_out_of_range THEN RETURN 'invalid';
 WHEN foreign_key_violation OR unique_violation THEN RETURN 'conflict';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_edit_purchasing_document(uuid,uuid,text,uuid,jsonb,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_edit_purchasing_document(uuid,uuid,text,uuid,jsonb,jsonb,jsonb) TO service_role;
