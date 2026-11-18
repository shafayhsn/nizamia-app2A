CREATE SCHEMA IF NOT EXISTS desktop_private;
REVOKE ALL ON SCHEMA desktop_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA desktop_private TO service_role;

CREATE TABLE IF NOT EXISTS desktop_private.production_create_receipts (
  operation_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  payload jsonb NOT NULL
);
REVOKE ALL ON desktop_private.production_create_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON desktop_private.production_create_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.desktop_create_production_entry(actor uuid, operation uuid, payload jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  prior desktop_private.production_create_receipts%ROWTYPE;
  requested public.production_daily_entries%ROWTYPE;
BEGIN
  IF actor IS NULL OR operation IS NULL OR payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RETURN 'invalid';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = actor AND u.role = 'admin' AND u.is_active IS TRUE AND u.is_restricted IS NOT TRUE
    FOR SHARE
  ) THEN RETURN 'unauthorized'; END IF;

  IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) AS field(name)
    WHERE field.name NOT IN ('order_id','size_group_id','color_id','department','movement','production_date','production_at','quantity')) THEN
    RETURN 'invalid';
  END IF;
  BEGIN
    requested := jsonb_populate_record(NULL::public.production_daily_entries,payload);
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range THEN
    RETURN 'invalid';
  END;
  IF requested.order_id IS NULL OR requested.size_group_id IS NULL OR requested.color_id IS NULL
    OR requested.quantity IS NULL OR requested.quantity <= 0 OR requested.production_date IS NULL
    OR requested.department IS NULL OR requested.department NOT IN ('Cutting','Stitching','Washing','Back Process','Finishing','Packing','Embroidery','Printing','Other')
    OR requested.movement IS NULL OR requested.movement NOT IN ('completed','sent','received')
    OR (requested.movement <> 'completed' AND requested.department NOT IN ('Washing','Embroidery','Printing','Other'))
    OR char_length(requested.production_at) > 1000
  THEN RETURN 'invalid'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('desktop-production:'||operation::text,0));
  SELECT * INTO prior FROM desktop_private.production_create_receipts WHERE operation_id=operation;
  IF FOUND THEN
    IF prior.actor_id=actor AND prior.payload=payload THEN RETURN 'already-applied'; END IF;
    RETURN 'conflict';
  END IF;

  INSERT INTO public.production_daily_entries (
    id,order_id,size_group_id,color_id,job_number,buyer_name,style_number,po_number,store_name,
    wash_name,size_group_name,department,movement,production_date,production_at,quantity,created_by
  )
  SELECT operation,o.id,g.id,c.id,o.job_number,o.buyer_name,o.style_number,o.po_number,o.store_name,
    coalesce(nullif(c.color_name,''),'—'),coalesce(nullif(g.group_name,''),'—'),
    requested.department,requested.movement,requested.production_date,requested.production_at,requested.quantity,actor
  FROM public.orders o
  JOIN public.size_groups g ON g.order_id=o.id
  JOIN public.size_group_colors c ON c.size_group_id=g.id
  WHERE o.id=requested.order_id AND g.id=requested.size_group_id AND c.id=requested.color_id
    AND btrim(coalesce(o.job_number,''))<>'' AND coalesce(o.status,'') !~* 'cancelled|canceled'
  FOR SHARE OF o,g,c
  ON CONFLICT (id) DO NOTHING;
  IF NOT FOUND THEN RETURN 'conflict'; END IF;
  INSERT INTO desktop_private.production_create_receipts VALUES (operation,actor,payload);
  RETURN 'applied';
END;
$$;
REVOKE ALL ON FUNCTION public.desktop_create_production_entry(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_create_production_entry(uuid,uuid,jsonb) TO service_role;
