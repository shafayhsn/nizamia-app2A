LOCK TABLE public.shipments IN SHARE ROW EXCLUSIVE MODE;

CREATE SEQUENCE public.shipment_number_seq START WITH 34;

SELECT pg_catalog.setval('public.shipment_number_seq',
  greatest(34, coalesce(max(substring(shipment_no from '^NZ-([0-9]{3,12})-[0-9]{2}$')::bigint), 0) + 1),
  false)
FROM public.shipments;

REVOKE ALL ON SEQUENCE public.shipment_number_seq FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.assign_shipment_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  serial_text text;
  year_suffix text;
BEGIN
  IF NEW.shipment_date IS NULL THEN
    RAISE EXCEPTION 'Shipment date is required to assign a shipment number';
  END IF;
  year_suffix := pg_catalog.to_char(NEW.shipment_date, 'YY');
  LOOP
    serial_text := pg_catalog.nextval('public.shipment_number_seq')::text;
    NEW.shipment_no := 'NZ-' || pg_catalog.lpad(serial_text, greatest(3, length(serial_text)), '0') || '-' || year_suffix;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.shipments WHERE shipment_no = NEW.shipment_no);
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_shipment_number() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER assign_shipment_number
BEFORE INSERT ON public.shipments
FOR EACH ROW WHEN (NEW.shipment_no IS NULL OR pg_catalog.btrim(NEW.shipment_no) = '')
EXECUTE FUNCTION public.assign_shipment_number();
