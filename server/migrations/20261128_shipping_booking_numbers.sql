LOCK TABLE public.shipping_bookings IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.shipping_bookings WHERE booking_no LIKE 'Book#%') <> 0
    OR (SELECT count(*) FROM public.shipping_bookings WHERE
      (id = '4fbbfc11-2f14-4e5d-895f-e55a65589f9c' AND booking_no = '2567723')
      OR (id = 'f162e8e5-98bf-475b-92ac-65d37ae90101' AND booking_no = 'TBC')) <> 2
  THEN
    RAISE EXCEPTION 'Booking numbers changed since verification';
  END IF;
END $$;

UPDATE public.shipping_bookings
SET booking_no = CASE id
  WHEN '4fbbfc11-2f14-4e5d-895f-e55a65589f9c' THEN 'Book#001'
  ELSE 'Book#002'
END
WHERE id IN ('4fbbfc11-2f14-4e5d-895f-e55a65589f9c', 'f162e8e5-98bf-475b-92ac-65d37ae90101');

CREATE SEQUENCE public.shipping_booking_number_seq START WITH 3;
REVOKE ALL ON SEQUENCE public.shipping_booking_number_seq FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.assign_shipping_booking_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  number_text text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.booking_no := OLD.booking_no;
  ELSE
    number_text := pg_catalog.nextval('public.shipping_booking_number_seq')::text;
    NEW.booking_no := 'Book#' || pg_catalog.lpad(number_text, greatest(3, length(number_text)), '0');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_shipping_booking_number() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER assign_shipping_booking_number
BEFORE INSERT OR UPDATE OF booking_no ON public.shipping_bookings
FOR EACH ROW EXECUTE FUNCTION public.assign_shipping_booking_number();
