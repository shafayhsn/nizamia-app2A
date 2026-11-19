CREATE TABLE IF NOT EXISTS desktop_private.sampling_parcel_receipts (
 operation_id uuid PRIMARY KEY,actor_id uuid NOT NULL,kind text NOT NULL,verb text NOT NULL,target text NOT NULL,patch jsonb,expected jsonb
);
REVOKE ALL ON desktop_private.sampling_parcel_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.sampling_parcel_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_change_sampling_parcel(
 actor uuid,operation uuid,kind text,verb text,target text,patch jsonb,expected jsonb
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.sampling_parcel_receipts%ROWTYPE;
 allowed text[];
 current_row jsonb;
 oid uuid;
 sid uuid;
 group_id uuid;
 sample_row public.samples%ROWTYPE;
 root public.samples%ROWTYPE;
 n integer;
 yy text:=to_char(now() AT TIME ZONE 'Asia/Karachi','YY');
 candidate text;
 latest public.sample_comments%ROWTYPE;
 address public.buyer_addresses%ROWTYPE;
 contact public.buyer_contacts%ROWTYPE;
 buyer public.buyers%ROWTYPE;
 parcel public.parcels%ROWTYPE;
 fields text;
 vals text;
BEGIN
 CASE kind
 WHEN 'samples' THEN allowed:=string_to_array('order_id sample_number sample_type color size requested_date due_date received_date status comments size_group_id size_group_name colours sizes base_size bom_snapshot wash_snapshot emb_snapshot req_pcs parent_sample_id root_sample_id version_no version_label stage approval_status dispatch_status last_comment_at last_comment_by workflow_meta',' ');
 WHEN 'sample_comments' THEN allowed:=string_to_array('sample_id root_sample_id sam_number version_label comment_type comment_text comment_by comment_date is_internal meta',' ');
 WHEN 'parcels' THEN allowed:=string_to_array('status dispatch_date courier tracking_no notes items custom_items tracking_url',' ');
 WHEN 'parcel_invoice_snapshots' THEN allowed:=ARRAY['address_id','contact_id'];
 ELSE RETURN 'invalid';
 END CASE;
 IF actor IS NULL OR operation IS NULL OR target IS NULL OR verb IS NULL OR verb NOT IN ('create','update','delete')
  OR (kind='parcels' AND verb='create') OR (kind='parcel_invoice_snapshots' AND verb<>'create') OR target !~ '^[a-zA-Z0-9_-]{1,128}$'
  OR (verb<>'delete' AND (coalesce(jsonb_typeof(patch),'')<>'object' OR patch='{}'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(patch) k WHERE NOT k=ANY(allowed))))
  OR (verb<>'create' AND coalesce(jsonb_typeof(expected),'')<>'object') THEN RETURN 'invalid'; END IF;
 IF verb='update' AND EXISTS(SELECT 1 FROM jsonb_object_keys(patch) k WHERE NOT expected ? k) THEN RETURN 'invalid'; END IF;
 IF kind IN ('samples','sample_comments') THEN PERFORM target::uuid; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin' AND u.is_active IS TRUE
  AND u.is_restricted IS NOT TRUE FOR SHARE) THEN RETURN 'unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-sampling-parcels:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.sampling_parcel_receipts p WHERE p.operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.kind=kind AND prior.verb=verb AND prior.target=target
   AND prior.patch IS NOT DISTINCT FROM patch AND prior.expected IS NOT DISTINCT FROM expected THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 INSERT INTO desktop_private.sampling_parcel_receipts VALUES(operation,actor,kind,verb,target,patch,expected);
 IF kind='parcel_invoice_snapshots' THEN
  SELECT * INTO parcel FROM public.parcels p WHERE p.id=target FOR UPDATE;
  IF NOT FOUND OR coalesce(jsonb_typeof(parcel.items),'')<>'array' OR jsonb_array_length(parcel.items)=0
   OR EXISTS(SELECT 1 FROM public.parcel_invoice_snapshots i WHERE i.parcel_id=target)
   THEN RAISE foreign_key_violation USING MESSAGE='Parcel or invoice has changed'; END IF;
  SELECT * INTO address FROM public.buyer_addresses a WHERE a.id=(patch->>'address_id')::uuid FOR SHARE;
  IF NOT FOUND THEN RAISE foreign_key_violation USING MESSAGE='Address unavailable'; END IF;
  SELECT * INTO buyer FROM public.buyers b WHERE b.id=address.buyer_id FOR SHARE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM jsonb_array_elements(parcel.items) item
    WHERE NOT EXISTS(SELECT 1 FROM public.samples s JOIN public.orders o ON o.id=s.order_id
     WHERE s.id=(item->>'sampleId')::uuid AND o.buyer_id=buyer.id))
   THEN RAISE foreign_key_violation USING MESSAGE='Address does not belong to the parcel buyer'; END IF;
  IF patch->>'contact_id' IS NOT NULL THEN
   SELECT * INTO contact FROM public.buyer_contacts c WHERE c.id=(patch->>'contact_id')::uuid AND c.buyer_id=buyer.id FOR SHARE;
   IF NOT FOUND THEN RAISE foreign_key_violation USING MESSAGE='Contact does not belong to the parcel buyer'; END IF;
  END IF;
  INSERT INTO public.parcel_invoice_snapshots(parcel_id,buyer_id,address_id,contact_id,consignee)
  VALUES(target,buyer.id,address.id,contact.id,jsonb_build_object(
   'name',coalesce(nullif(address.recipient,''),buyer.name,''),'label',coalesce(address.label,''),
   'address_line1',coalesce(address.address_line1,''),'address_line2',coalesce(address.address_line2,''),
   'city',coalesce(address.city,''),'region',coalesce(address.region,''),'postal_code',coalesce(address.postal_code,''),
   'country',coalesce(address.country,''),'contact_name',coalesce(nullif(contact.name,''),buyer.contact_person,''),
   'phone',coalesce(nullif(contact.phone,''),address.phone,''),'email',coalesce(nullif(contact.email,''),address.email,'')));
  RETURN 'applied';
 END IF;
 IF verb<>'create' THEN
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id::text=$1 FOR UPDATE',kind) INTO current_row USING target;
  IF current_row IS NULL OR NOT current_row @> expected THEN RAISE foreign_key_violation USING MESSAGE='Record changed'; END IF;
 END IF;
 IF verb='delete' THEN
  IF kind='samples' AND (
   EXISTS(SELECT 1 FROM public.samples s WHERE s.parent_sample_id=target::uuid OR s.root_sample_id=target::uuid AND s.id<>target::uuid)
   OR EXISTS(SELECT 1 FROM public.sample_comments c WHERE c.sample_id=target::uuid OR c.root_sample_id=target::uuid)
   OR EXISTS(SELECT 1 FROM public.sample_logs l WHERE l.sample_id=target::uuid OR l.root_sample_id=target::uuid)
   OR EXISTS(SELECT 1 FROM public.parcels p CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(p.items)='array' THEN p.items ELSE '[]'::jsonb END) item WHERE item->>'sampleId'=target))
   THEN RAISE foreign_key_violation USING MESSAGE='Sample has linked history or a parcel'; END IF;
  EXECUTE format('DELETE FROM public.%I WHERE id::text=$1',kind) USING target;
  RETURN 'applied';
 END IF;
 IF kind='samples' THEN
  IF verb='update' AND patch ?| ARRAY['order_id','sample_number','parent_sample_id','root_sample_id','version_no','version_label'] THEN
   RAISE check_violation USING MESSAGE='Sample identity cannot change'; END IF;
  oid:=coalesce(patch->>'order_id',current_row->>'order_id')::uuid;
  IF oid IS NULL OR NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.id=oid FOR UPDATE)
   THEN RAISE foreign_key_violation USING MESSAGE='Order unavailable'; END IF;
  group_id:=coalesce(patch->>'size_group_id',current_row->>'size_group_id')::uuid;
  IF group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.size_groups g WHERE g.id=group_id AND g.order_id=oid FOR SHARE)
   THEN RAISE foreign_key_violation USING MESSAGE='Size group belongs to another order'; END IF;
  IF verb='create' THEN
   IF nullif(btrim(patch->>'sample_type'),'') IS NULL THEN RAISE check_violation USING MESSAGE='Sample type required'; END IF;
   IF patch->>'parent_sample_id' IS NOT NULL THEN
    SELECT * INTO sample_row FROM public.samples s WHERE s.id=(patch->>'parent_sample_id')::uuid AND s.order_id=oid FOR SHARE;
    IF NOT FOUND THEN RAISE foreign_key_violation USING MESSAGE='Missing source sample'; END IF;
    SELECT * INTO root FROM public.samples s WHERE s.id=coalesce(sample_row.root_sample_id,sample_row.id) AND s.order_id=oid FOR UPDATE;
    IF NOT FOUND THEN RAISE foreign_key_violation USING MESSAGE='Missing sample family'; END IF;
    SELECT greatest(1,coalesce(max(s.version_no),1))+1 INTO n FROM public.samples s WHERE s.id=root.id OR s.root_sample_id=root.id;
    candidate:=regexp_replace(root.sample_number,'-V[0-9]+$','','i')||'-V'||n;
    patch:=patch||jsonb_build_object('root_sample_id',root.id,'version_no',n,'version_label','V'||n);
   ELSE
    FOR attempt IN 1..20 LOOP
     INSERT INTO public.counters AS c(key,value) VALUES('sam_'||yy,1)
      ON CONFLICT(key) DO UPDATE SET value=c.value+1 RETURNING value INTO n;
     candidate:='SAM-'||yy||lpad(n::text,greatest(2,length(n::text)),'0');
     EXIT WHEN NOT EXISTS(SELECT 1 FROM public.samples s WHERE s.sample_number=candidate);
     IF attempt=20 THEN RAISE unique_violation USING MESSAGE='No available sample number'; END IF;
    END LOOP;
    patch:=(patch-ARRAY['root_sample_id','parent_sample_id'])||jsonb_build_object('version_no',1,'version_label','V1');
   END IF;
   patch:=patch||jsonb_build_object('sample_number',candidate);
  END IF;
 ELSIF kind='sample_comments' THEN
  IF verb='update' AND patch ?| ARRAY['sample_id','root_sample_id','sam_number','version_label','is_internal'] THEN
   RAISE check_violation USING MESSAGE='Comment identity cannot change'; END IF;
  sid:=coalesce(patch->>'sample_id',current_row->>'sample_id')::uuid;
  SELECT * INTO sample_row FROM public.samples s WHERE s.id=sid FOR UPDATE;
  IF NOT FOUND THEN RAISE foreign_key_violation USING MESSAGE='Sample unavailable'; END IF;
  IF verb='create' THEN patch:=patch||jsonb_build_object('sample_id',sid,'root_sample_id',coalesce(sample_row.root_sample_id,sid),
    'sam_number',sample_row.sample_number,'version_label',coalesce(sample_row.version_label,'V1')); END IF;
 ELSIF kind='parcels' THEN
  IF patch ? 'status' AND (patch->>'status' NOT IN ('Dispatched','In-Transit','On Hold','Returned','Out for Delivery')
   OR current_row->>'status' IN ('Draft','Delivered')) THEN RAISE check_violation USING MESSAGE='Unsupported parcel transition'; END IF;
  IF patch ? 'items' AND (coalesce(jsonb_typeof(patch->'items'),'')<>'array' OR jsonb_array_length(patch->'items')>500
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(patch->'items') item WHERE NOT EXISTS(
    SELECT 1 FROM public.samples s WHERE s.id=(item->>'sampleId')::uuid)))
   THEN RAISE foreign_key_violation USING MESSAGE='Invalid parcel sample links'; END IF;
  patch:=patch||jsonb_build_object('updated_at',now());
 END IF;
 IF verb='create' THEN patch:=patch||jsonb_build_object('id',target); END IF;
 SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('r.%I',k),',' ORDER BY k) INTO fields,vals
  FROM jsonb_object_keys(patch) k;
 IF verb='create' THEN
  EXECUTE format('INSERT INTO public.%I(%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) r',
   kind,fields,vals,kind) USING patch;
 ELSE
  EXECUTE format('UPDATE public.%I t SET (%s)=(SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) r) WHERE t.id::text=$2',
   kind,fields,vals,kind) USING patch,target;
 END IF;
 IF kind='samples' THEN UPDATE public.orders SET step_sampling=true WHERE id=oid; END IF;
 IF kind='sample_comments' THEN
  SELECT * INTO latest FROM public.sample_comments c WHERE c.sample_id=sid AND c.is_internal IS NOT TRUE
    AND c.comment_type IN ('Approval','Revision','Rejection') ORDER BY c.created_at DESC NULLS LAST,c.id DESC LIMIT 1;
  IF FOUND THEN
   UPDATE public.samples SET approval_status=CASE latest.comment_type WHEN 'Approval' THEN 'Approved'
       WHEN 'Revision' THEN 'Revision Required' ELSE 'Rejected' END,
    last_comment_at=latest.comment_date,last_comment_by=latest.comment_by,
    dispatch_status=CASE WHEN dispatch_status='Delivered' THEN dispatch_status ELSE 'Comments Received' END
    WHERE id=sid;
  END IF;
 END IF;
 IF kind='parcels' AND patch ? 'status' AND patch->>'status' IS DISTINCT FROM current_row->>'status' THEN
  INSERT INTO public.parcel_status_history(parcel_id,old_status,new_status) VALUES(target,current_row->>'status',patch->>'status');
 END IF;
 RETURN 'applied';
EXCEPTION WHEN foreign_key_violation OR unique_violation THEN RETURN 'conflict';
 WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR check_violation OR not_null_violation OR numeric_value_out_of_range
 THEN RETURN 'invalid';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_change_sampling_parcel(uuid,uuid,text,text,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_change_sampling_parcel(uuid,uuid,text,text,text,jsonb,jsonb) TO service_role;

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
 details jsonb;
 next_parcel public.parcels%ROWTYPE;
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
              WHERE k.key NOT IN ('status','expected_status','expected_updated_at','delivery_date','received_by','details'))
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
 next_parcel:=current_parcel;
 IF payload ? 'details' THEN
  details:=payload->'details';
  IF next_status<>'Dispatched' OR jsonb_typeof(details)<>'object' OR
   EXISTS(SELECT 1 FROM jsonb_object_keys(details) k WHERE k NOT IN ('dispatch_date','courier','tracking_no','notes','items','custom_items','tracking_url'))
   THEN RETURN 'invalid'; END IF;
  next_parcel:=jsonb_populate_record(current_parcel,details);
 END IF;
 IF next_status='Dispatched' AND (current_parcel.status<>'Draft' OR
    nullif(btrim(next_parcel.courier),'') IS NULL OR nullif(btrim(next_parcel.tracking_no),'') IS NULL
    OR next_parcel.dispatch_date IS NULL) THEN RETURN 'conflict'; END IF;
 IF next_status='Delivered' AND (current_parcel.status='Draft' OR delivery_day<current_parcel.dispatch_date)
 THEN RETURN 'conflict'; END IF;
 IF coalesce(jsonb_typeof(next_parcel.items),'')<>'array' OR jsonb_array_length(next_parcel.items)>500
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(next_parcel.items) AS x(item)
      WHERE coalesce(x.item->>'sampleId','') !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$')
 THEN RETURN 'conflict'; END IF;
 SELECT coalesce(array_agg(DISTINCT (x.item->>'sampleId')::uuid),ARRAY[]::uuid[]) INTO sample_ids
 FROM jsonb_array_elements(next_parcel.items) AS x(item);
 PERFORM s.id FROM public.samples s WHERE s.id=ANY(sample_ids) ORDER BY s.id FOR UPDATE;
 IF (SELECT count(*) FROM public.samples s WHERE s.id=ANY(sample_ids))<>cardinality(sample_ids)
    OR (next_status='Dispatched' AND EXISTS(SELECT 1 FROM public.samples s
        WHERE s.id=ANY(sample_ids) AND s.dispatch_status='Delivered')) THEN RETURN 'conflict'; END IF;

 UPDATE public.parcels SET status=next_status,updated_at=now(),
  courier=next_parcel.courier,tracking_no=next_parcel.tracking_no,tracking_url=next_parcel.tracking_url,
  dispatch_date=next_parcel.dispatch_date,notes=next_parcel.notes,items=next_parcel.items,custom_items=next_parcel.custom_items,
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
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN 'invalid';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_transition_parcel(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_transition_parcel(uuid,uuid,text,jsonb) TO service_role;
