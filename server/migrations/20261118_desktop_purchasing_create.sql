CREATE SCHEMA IF NOT EXISTS desktop_private;
REVOKE ALL ON SCHEMA desktop_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA desktop_private TO service_role;

CREATE TABLE IF NOT EXISTS desktop_private.purchasing_create_receipts (
 operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, kind text NOT NULL, payload jsonb NOT NULL
);
REVOKE ALL ON desktop_private.purchasing_create_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.purchasing_create_receipts TO service_role;

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
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin'
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
