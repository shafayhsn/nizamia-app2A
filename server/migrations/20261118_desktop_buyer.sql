CREATE TABLE IF NOT EXISTS desktop_private.buyer_receipts (
 operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, target_id uuid, patch jsonb NOT NULL, expected jsonb
);
REVOKE ALL ON desktop_private.buyer_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.buyer_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_save_buyer(actor uuid,operation uuid,target_buyer uuid,patch jsonb,expected jsonb)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.buyer_receipts%ROWTYPE;
 profile public.buyers%ROWTYPE;
 buyer_key uuid:=coalesce(target_buyer,operation);
 header jsonb:=patch->'header';
 details jsonb:=patch->'details';
 entry text;
 current_rows jsonb;
 incoming jsonb;
BEGIN
 IF actor IS NULL OR operation IS NULL OR coalesce(jsonb_typeof(header),'')<>'object' OR header='{}'::jsonb
  OR coalesce(jsonb_typeof(details),'')<>'object'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(header) k WHERE k NOT IN
   ('name','contact_person','email','phone','address','country','currency','default_incoterms','default_ship_mode','notes','is_active','payment_terms_days'))
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(details) k WHERE k NOT IN ('buyer_addresses','buyer_contacts'))
  OR (target_buyer IS NOT NULL AND (coalesce(jsonb_typeof(expected->'header'),'')<>'object'
   OR coalesce(jsonb_typeof(expected->'details'),'')<>'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(header) k WHERE NOT (expected->'header') ? k)
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(expected->'header') k WHERE NOT header ? k)))
 THEN RETURN 'invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin'
    AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE)
 THEN RETURN 'unauthorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-buyer:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.buyer_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.target_id IS NOT DISTINCT FROM target_buyer
   AND prior.patch=patch AND prior.expected IS NOT DISTINCT FROM expected THEN RETURN 'already-applied'; END IF;
  RETURN 'conflict';
 END IF;
 profile:=jsonb_populate_record(NULL::public.buyers,header);
 IF (target_buyer IS NULL OR header ? 'name') AND nullif(btrim(profile.name),'') IS NULL THEN RETURN 'invalid'; END IF;
 IF target_buyer IS NOT NULL THEN
  PERFORM 1 FROM public.buyers b WHERE b.id=buyer_key AND to_jsonb(b) @> (expected->'header') FOR UPDATE;
  IF NOT FOUND THEN RETURN 'conflict'; END IF;
 END IF;
 FOR entry,incoming IN SELECT key,value FROM jsonb_each(details) LOOP
  IF coalesce(jsonb_typeof(incoming),'')<>'array' OR jsonb_array_length(incoming)>100
    OR (SELECT count(DISTINCT (item->>'id')::uuid) FROM jsonb_array_elements(incoming) item)<>jsonb_array_length(incoming)
    OR (jsonb_array_length(incoming)>0 AND (SELECT count(*) FROM jsonb_array_elements(incoming) item
      WHERE item->'is_default'='true'::jsonb)<>1) THEN RETURN 'invalid'; END IF;
  IF target_buyer IS NULL THEN CONTINUE; END IF;
  IF coalesce(jsonb_typeof(expected->'details'->entry),'')<>'array' THEN RETURN 'invalid'; END IF;
  EXECUTE format('SELECT 1 FROM public.%I WHERE buyer_id=$1 FOR UPDATE',entry) USING buyer_key;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t)),''[]'') FROM public.%I t WHERE buyer_id=$1',entry)
   INTO current_rows USING buyer_key;
  IF jsonb_array_length(current_rows)<>jsonb_array_length(expected->'details'->entry)
   OR NOT (current_rows @> (expected->'details'->entry) AND current_rows <@ (expected->'details'->entry))
  THEN RETURN 'conflict'; END IF;
 END LOOP;
 IF target_buyer IS NULL THEN
  INSERT INTO public.buyers(id,name,contact_person,email,phone,address,country,currency,default_incoterms,default_ship_mode,notes,is_active,payment_terms_days)
  VALUES(buyer_key,profile.name,profile.contact_person,profile.email,profile.phone,profile.address,profile.country,profile.currency,profile.default_incoterms,profile.default_ship_mode,profile.notes,coalesce(profile.is_active,true),profile.payment_terms_days);
 ELSE
  UPDATE public.buyers b SET
   name=CASE WHEN header ? 'name' THEN profile.name ELSE b.name END,
   contact_person=CASE WHEN header ? 'contact_person' THEN profile.contact_person ELSE b.contact_person END,
   email=CASE WHEN header ? 'email' THEN profile.email ELSE b.email END,
   phone=CASE WHEN header ? 'phone' THEN profile.phone ELSE b.phone END,
   address=CASE WHEN header ? 'address' THEN profile.address ELSE b.address END,
   country=CASE WHEN header ? 'country' THEN profile.country ELSE b.country END,
   currency=CASE WHEN header ? 'currency' THEN profile.currency ELSE b.currency END,
   default_incoterms=CASE WHEN header ? 'default_incoterms' THEN profile.default_incoterms ELSE b.default_incoterms END,
   default_ship_mode=CASE WHEN header ? 'default_ship_mode' THEN profile.default_ship_mode ELSE b.default_ship_mode END,
   notes=CASE WHEN header ? 'notes' THEN profile.notes ELSE b.notes END,
   is_active=CASE WHEN header ? 'is_active' THEN profile.is_active ELSE b.is_active END,
   payment_terms_days=CASE WHEN header ? 'payment_terms_days' THEN profile.payment_terms_days ELSE b.payment_terms_days END,updated_at=now()
  WHERE b.id=buyer_key;
 END IF;
 IF details ? 'buyer_addresses' THEN
  UPDATE public.buyer_addresses SET is_default=false WHERE buyer_id=buyer_key AND is_default;
  DELETE FROM public.buyer_addresses d WHERE d.buyer_id=buyer_key AND NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(details->'buyer_addresses') item WHERE (item->>'id')::uuid=d.id);
  INSERT INTO public.buyer_addresses AS existing(id,buyer_id,label,recipient,address_line1,address_line2,city,region,postal_code,country,phone,email,is_default)
  SELECT d.id,buyer_key,d.label,d.recipient,d.address_line1,d.address_line2,d.city,d.region,d.postal_code,d.country,d.phone,d.email,d.is_default
  FROM jsonb_populate_recordset(NULL::public.buyer_addresses,details->'buyer_addresses') d
  ON CONFLICT(id) DO UPDATE SET label=excluded.label,recipient=excluded.recipient,address_line1=excluded.address_line1,address_line2=excluded.address_line2,city=excluded.city,region=excluded.region,postal_code=excluded.postal_code,country=excluded.country,phone=excluded.phone,email=excluded.email,is_default=excluded.is_default
  WHERE existing.buyer_id=buyer_key;
  IF NOT EXISTS(SELECT 1 FROM public.buyer_addresses d WHERE d.buyer_id=buyer_key HAVING count(*)=jsonb_array_length(details->'buyer_addresses'))
  THEN RAISE foreign_key_violation USING MESSAGE='Buyer detail belongs to a different buyer'; END IF;
 END IF;
 IF details ? 'buyer_contacts' THEN
  UPDATE public.buyer_contacts SET is_default=false WHERE buyer_id=buyer_key AND is_default;
  DELETE FROM public.buyer_contacts d WHERE d.buyer_id=buyer_key AND NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(details->'buyer_contacts') item WHERE (item->>'id')::uuid=d.id);
  INSERT INTO public.buyer_contacts AS existing(id,buyer_id,name,designation,department,phone,email,is_default)
  SELECT d.id,buyer_key,d.name,d.designation,d.department,d.phone,d.email,d.is_default
  FROM jsonb_populate_recordset(NULL::public.buyer_contacts,details->'buyer_contacts') d
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,designation=excluded.designation,department=excluded.department,phone=excluded.phone,email=excluded.email,is_default=excluded.is_default
  WHERE existing.buyer_id=buyer_key;
  IF NOT EXISTS(SELECT 1 FROM public.buyer_contacts d WHERE d.buyer_id=buyer_key HAVING count(*)=jsonb_array_length(details->'buyer_contacts'))
  THEN RAISE foreign_key_violation USING MESSAGE='Buyer detail belongs to a different buyer'; END IF;
 END IF;
 INSERT INTO desktop_private.buyer_receipts VALUES(operation,actor,target_buyer,patch,expected);
 RETURN 'applied';
EXCEPTION WHEN invalid_text_representation OR check_violation OR numeric_value_out_of_range OR not_null_violation THEN RETURN 'invalid';
 WHEN unique_violation OR foreign_key_violation THEN RETURN 'conflict';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_save_buyer(uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_save_buyer(uuid,uuid,uuid,jsonb,jsonb) TO service_role;
