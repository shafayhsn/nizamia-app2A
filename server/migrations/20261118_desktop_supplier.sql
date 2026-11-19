CREATE TABLE IF NOT EXISTS desktop_private.supplier_receipts (
 operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, target_id uuid, patch jsonb NOT NULL, expected jsonb
);
REVOKE ALL ON desktop_private.supplier_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.supplier_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_save_supplier(actor uuid,operation uuid,target_supplier uuid,patch jsonb,expected jsonb)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.supplier_receipts%ROWTYPE;
 next_supplier public.suppliers%ROWTYPE;
BEGIN
 IF actor IS NULL OR operation IS NULL OR coalesce(jsonb_typeof(patch),'')<>'object' OR patch='{}'::jsonb
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(patch) k WHERE k NOT IN
   ('name','contact_person','email','phone','address','category','lead_time_days','notes','process','tags','is_active'))
  OR (target_supplier IS NOT NULL AND (coalesce(jsonb_typeof(expected),'')<>'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(patch) k WHERE NOT expected ? k)
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(expected) k WHERE NOT patch ? k)))
 THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin'
    AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE)
 THEN RETURN 'unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-supplier:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.supplier_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.target_id IS NOT DISTINCT FROM target_supplier
   AND prior.patch=patch AND prior.expected IS NOT DISTINCT FROM expected THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 next_supplier:=jsonb_populate_record(NULL::public.suppliers,patch);
 IF ((target_supplier IS NULL OR patch ? 'name') AND nullif(btrim(next_supplier.name),'') IS NULL)
   OR next_supplier.lead_time_days<0 THEN RETURN 'invalid'; END IF;
 IF target_supplier IS NULL THEN
  INSERT INTO public.suppliers(id,name,contact_person,email,phone,address,category,lead_time_days,notes,process,tags,is_active)
  VALUES(operation,next_supplier.name,next_supplier.contact_person,next_supplier.email,next_supplier.phone,next_supplier.address,
   next_supplier.category,next_supplier.lead_time_days,next_supplier.notes,next_supplier.process,next_supplier.tags,
   coalesce(next_supplier.is_active,true));
 ELSE
  UPDATE public.suppliers s SET
    name=CASE WHEN patch ? 'name' THEN next_supplier.name ELSE s.name END,
    contact_person=CASE WHEN patch ? 'contact_person' THEN next_supplier.contact_person ELSE s.contact_person END,
    email=CASE WHEN patch ? 'email' THEN next_supplier.email ELSE s.email END,
    phone=CASE WHEN patch ? 'phone' THEN next_supplier.phone ELSE s.phone END,
    address=CASE WHEN patch ? 'address' THEN next_supplier.address ELSE s.address END,
    category=CASE WHEN patch ? 'category' THEN next_supplier.category ELSE s.category END,
    lead_time_days=CASE WHEN patch ? 'lead_time_days' THEN next_supplier.lead_time_days ELSE s.lead_time_days END,
    notes=CASE WHEN patch ? 'notes' THEN next_supplier.notes ELSE s.notes END,
    process=CASE WHEN patch ? 'process' THEN next_supplier.process ELSE s.process END,
    tags=CASE WHEN patch ? 'tags' THEN next_supplier.tags ELSE s.tags END,
    is_active=CASE WHEN patch ? 'is_active' THEN next_supplier.is_active ELSE s.is_active END,updated_at=now()
  WHERE s.id=target_supplier AND to_jsonb(s) @> expected;
  IF NOT FOUND THEN RETURN 'conflict'; END IF;
 END IF;
 INSERT INTO desktop_private.supplier_receipts VALUES(operation,actor,target_supplier,patch,expected);
 RETURN 'applied';
EXCEPTION WHEN invalid_text_representation OR check_violation OR numeric_value_out_of_range OR not_null_violation THEN RETURN 'invalid';
 WHEN unique_violation OR foreign_key_violation THEN RETURN 'conflict';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_save_supplier(uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_save_supplier(uuid,uuid,uuid,jsonb,jsonb) TO service_role;
