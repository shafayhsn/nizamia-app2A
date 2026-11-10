-- STAGING ONLY: apply after checking existing costing_sheets rows and reference uniqueness.
-- Preserve historical costing references; allocate new references independently by type.
CREATE SEQUENCE IF NOT EXISTS public.costing_woven_ref_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.costing_knits_ref_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.quotation_ref_seq START WITH 1;

-- Advance sequences past existing CW-/CK- references if they are already present.
SELECT setval('public.costing_woven_ref_seq',GREATEST(1,COALESCE((SELECT MAX(SUBSTRING(reference FROM '^CW-([0-9]+)$')::bigint) FROM public.costing_sheets WHERE reference ~ '^CW-[0-9]+$'),0)),(SELECT EXISTS(SELECT 1 FROM public.costing_sheets WHERE reference ~ '^CW-[0-9]+$')));
SELECT setval('public.costing_knits_ref_seq',GREATEST(1,COALESCE((SELECT MAX(SUBSTRING(reference FROM '^CK-([0-9]+)$')::bigint) FROM public.costing_sheets WHERE reference ~ '^CK-[0-9]+$'),0)),(SELECT EXISTS(SELECT 1 FROM public.costing_sheets WHERE reference ~ '^CK-[0-9]+$')));

CREATE OR REPLACE FUNCTION public.allocate_costing_reference()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.reference IS NULL OR NEW.reference = '' THEN
   IF NEW.type = 'woven' THEN
     NEW.reference := 'CW-' || LPAD(nextval('public.costing_woven_ref_seq')::text,4,'0');
   ELSIF NEW.type = 'knits' THEN
     NEW.reference := 'CK-' || LPAD(nextval('public.costing_knits_ref_seq')::text,4,'0');
   ELSE
     RAISE EXCEPTION 'Unsupported costing type';
   END IF;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS costing_reference_by_type ON public.costing_sheets;
CREATE TRIGGER costing_reference_by_type BEFORE INSERT ON public.costing_sheets
FOR EACH ROW EXECUTE FUNCTION public.allocate_costing_reference();

-- For future persisted quotations, allocate QUO-001, QUO-002, ... on INSERT.
-- Do not allocate quotation IDs on preview/print/export; unsaved drafts have no permanent ID.
CREATE OR REPLACE FUNCTION public.next_quotation_reference()
RETURNS text LANGUAGE sql AS $$
 SELECT 'QUO-' || LPAD(nextval('public.quotation_ref_seq')::text,3,'0');
$$;
