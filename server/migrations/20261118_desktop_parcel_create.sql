CREATE SCHEMA IF NOT EXISTS desktop_private;
REVOKE ALL ON SCHEMA desktop_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA desktop_private TO service_role;
CREATE TABLE IF NOT EXISTS desktop_private.parcel_create_receipts (
 operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, parcel_id text NOT NULL, payload jsonb NOT NULL
);
REVOKE ALL ON desktop_private.parcel_create_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.parcel_create_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_create_parcel(
 actor uuid, operation uuid, payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 prior desktop_private.parcel_create_receipts%ROWTYPE;
 address public.buyer_addresses%ROWTYPE;
 contact public.buyer_contacts%ROWTYPE;
 buyer public.buyers%ROWTYPE;
 parcel_number text;
 consignee jsonb;
 sample_ids uuid[];
BEGIN
 IF actor IS NULL OR operation IS NULL OR coalesce(jsonb_typeof(payload),'')<>'object'
    OR coalesce(jsonb_typeof(payload->'items'),'')<>'array'
    OR coalesce(jsonb_typeof(payload->'custom_items'),'')<>'array' THEN RETURN '{"outcome":"invalid"}'; END IF;
 IF jsonb_array_length(payload->'items')+jsonb_array_length(payload->'custom_items') NOT BETWEEN 1 AND 500
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k(name)
       WHERE k.name NOT IN ('items','custom_items','address_id','contact_id'))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'items') x(item)
       WHERE coalesce(x.item->>'sampleId','') !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$')
 THEN RETURN '{"outcome":"invalid"}'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.role='admin'
    AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE FOR SHARE)
 THEN RETURN '{"outcome":"unauthorized"}'; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('desktop-parcel-create:'||operation::text,0));
 SELECT * INTO prior FROM desktop_private.parcel_create_receipts r WHERE r.operation_id=operation;
 IF FOUND THEN
  IF prior.actor_id=actor AND prior.payload=payload
  THEN RETURN jsonb_build_object('outcome','already-applied','resourceId',prior.parcel_id); END IF;
  RETURN '{"outcome":"conflict"}';
 END IF;
 SELECT * INTO address FROM public.buyer_addresses a WHERE a.id=(payload->>'address_id')::uuid FOR SHARE;
 IF NOT FOUND THEN RETURN '{"outcome":"conflict"}'; END IF;
 SELECT * INTO buyer FROM public.buyers b WHERE b.id=address.buyer_id FOR SHARE;
 IF NOT FOUND THEN RETURN '{"outcome":"conflict"}'; END IF;
 IF payload->>'contact_id' IS NOT NULL THEN
  SELECT * INTO contact FROM public.buyer_contacts c WHERE c.id=(payload->>'contact_id')::uuid AND c.buyer_id=buyer.id FOR SHARE;
  IF NOT FOUND THEN RETURN '{"outcome":"conflict"}'; END IF;
 END IF;
 SELECT coalesce(array_agg(DISTINCT (x.item->>'sampleId')::uuid),ARRAY[]::uuid[]) INTO sample_ids
 FROM jsonb_array_elements(payload->'items') x(item);
 IF cardinality(sample_ids)<>jsonb_array_length(payload->'items') THEN RETURN '{"outcome":"invalid"}'; END IF;
 PERFORM s.id FROM public.samples s WHERE s.id=ANY(sample_ids) ORDER BY s.id FOR UPDATE;
 IF (SELECT count(*) FROM public.samples s JOIN public.orders o ON o.id=s.order_id
     WHERE s.id=ANY(sample_ids) AND o.buyer_id=buyer.id AND lower(coalesce(s.stage,''))='ready')<>cardinality(sample_ids)
    OR EXISTS(SELECT 1 FROM public.parcels p CROSS JOIN LATERAL jsonb_array_elements(p.items) x(item)
      WHERE p.status<>'Cancelled' AND x.item->>'sampleId'=ANY(sample_ids::text[]))
 THEN RETURN '{"outcome":"conflict"}'; END IF;

 parcel_number:=public.allocate_parcel_number_2026();
 IF parcel_number IS NULL THEN RETURN '{"outcome":"conflict"}'; END IF;
 consignee:=jsonb_build_object('name',coalesce(nullif(address.recipient,''),buyer.name,''),
  'label',coalesce(address.label,''),'address_line1',coalesce(address.address_line1,''),
  'address_line2',coalesce(address.address_line2,''),'city',coalesce(address.city,''),
  'region',coalesce(address.region,''),'postal_code',coalesce(address.postal_code,''),
  'country',coalesce(address.country,''),'contact_name',coalesce(nullif(contact.name,''),buyer.contact_person,''),
  'phone',coalesce(nullif(contact.phone,''),address.phone,''),'email',coalesce(nullif(contact.email,''),address.email,''));
 INSERT INTO public.parcels(id,status,items,custom_items) VALUES(parcel_number,'Draft',payload->'items',payload->'custom_items');
 INSERT INTO public.parcel_invoice_snapshots(parcel_id,buyer_id,address_id,contact_id,consignee)
 VALUES(parcel_number,buyer.id,address.id,contact.id,consignee);
 INSERT INTO desktop_private.parcel_create_receipts VALUES(operation,actor,parcel_number,payload);
 RETURN jsonb_build_object('outcome','applied','resourceId',parcel_number);
EXCEPTION WHEN invalid_text_representation OR check_violation OR not_null_violation THEN RETURN '{"outcome":"invalid"}';
 WHEN foreign_key_violation OR unique_violation THEN RETURN '{"outcome":"conflict"}';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_create_parcel(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_create_parcel(uuid,uuid,jsonb) TO service_role;
