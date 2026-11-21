-- Shared online workspace for web and Electron. Drafts are editable independently of orders.
CREATE TABLE public.bulk_bom_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  buyer_id uuid NOT NULL REFERENCES public.buyers(id),
  draft jsonb NOT NULL CHECK (jsonb_typeof(draft) = 'object'),
  revision uuid NOT NULL DEFAULT gen_random_uuid(),
  applied_at timestamptz
);
ALTER TABLE public.bulk_bom_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bulk_bom_drafts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.bulk_bom_drafts TO anon, authenticated;
CREATE POLICY bulk_bom_view ON public.bulk_bom_drafts FOR SELECT TO anon, authenticated
 USING (public.team_can_access('library','view') AND public.team_can_access('orders','view'));
CREATE POLICY bulk_bom_create ON public.bulk_bom_drafts FOR INSERT TO anon, authenticated
 WITH CHECK (public.team_can_access('library','view') AND public.team_can_access('orders','edit') AND applied_at IS NULL);
REVOKE UPDATE ON public.bulk_bom_drafts FROM anon, authenticated;
GRANT UPDATE (name,draft,revision) ON public.bulk_bom_drafts TO anon, authenticated;
CREATE POLICY bulk_bom_edit ON public.bulk_bom_drafts FOR UPDATE TO anon, authenticated
 USING (public.team_can_access('library','view') AND public.team_can_access('orders','edit'))
 WITH CHECK (public.team_can_access('library','view') AND public.team_can_access('orders','edit'));

CREATE FUNCTION public.bulk_bom_review(draft_id uuid, selected_styles text[], expected jsonb DEFAULT NULL, replace_lines uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  saved public.bulk_bom_drafts%ROWTYPE;
  ord public.orders%ROWTYPE;
  lib public.library_items%ROWTYPE;
  item jsonb; setup jsonb; spec text; shade text; rule text; rate numeric; required_qty numeric;
  group_row record; rates jsonb; missing text; wastage_rate numeric;
  old_line public.bom_items%ROWTYPE; matches integer; candidate jsonb; entry jsonb; review jsonb := '[]';
  typed_line public.bom_items%ROWTYPE; old_rates jsonb;
  matched_styles text[] := '{}'; action text; next_sort integer;
BEGIN
  IF NOT (public.team_can_access('library','view') AND public.team_can_access('orders','edit')) THEN
    RAISE EXCEPTION 'Bulk BOM requires Library access and Orders edit permission';
  END IF;
  SELECT * INTO STRICT saved FROM public.bulk_bom_drafts WHERE id=draft_id FOR UPDATE;
  IF coalesce(cardinality(selected_styles),0)=0 OR NOT (
    selected_styles <@ ARRAY(SELECT jsonb_array_elements_text(saved.draft->'styles'))
  ) THEN RAISE EXCEPTION 'Select styles from the saved Bulk BOM'; END IF;
  IF coalesce(jsonb_array_length(saved.draft->'materials'),0)=0 THEN
    RAISE EXCEPTION 'Add at least one material';
  END IF;

  -- Lock writes while calculating and applying a reviewed set. No order-wide delete or rewrite.
  IF expected IS NOT NULL THEN
    LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;
    LOCK TABLE public.size_groups, public.size_group_breakdown, public.library_items, public.finishing_packs IN SHARE MODE;
    LOCK TABLE public.bom_items IN SHARE ROW EXCLUSIVE MODE;
  END IF;
  FOR ord IN SELECT * FROM public.orders
    WHERE buyer_id=saved.buyer_id AND style_number=ANY(selected_styles) ORDER BY style_number, id
  LOOP
    matched_styles := array_append(matched_styles, ord.style_number);
    FOR item IN SELECT value FROM jsonb_array_elements(saved.draft->'materials') LOOP
      SELECT * INTO STRICT lib FROM public.library_items WHERE id=(item->>'id')::uuid
        AND category IN ('Fabric','Stitching Trim','Packing Trim');
      rule := item->>'usage';
      IF rule IS NULL OR rule NOT IN ('Generic','By Size Group') THEN RAISE EXCEPTION 'Invalid material usage'; END IF;
      setup := item->'settings'->ord.style_number;
      spec := coalesce(setup->>'spec',CASE WHEN lib.category='Fabric'
        THEN concat_ws(', ',nullif(lib.composition,''),nullif(lib.weight::text,''),nullif(lib.width_inches::text,'')||'"')
        ELSE lib.description END,'');
      shade := CASE WHEN lib.category='Fabric' THEN nullif(lib.colour,'') END;
      wastage_rate := coalesce(nullif(lib.default_wastage,0),5);
      rate := nullif(CASE WHEN (item->>'shared')::boolean THEN item->>'rate' ELSE setup->>'rate' END,'')::numeric;
      rates := CASE WHEN nullif(lib.packing_form,'') IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('_packing_unit',lib.packing_form) END;
      required_qty := 0; missing := NULL;
      IF rule='Generic' THEN
        IF rate IS NULL OR rate<=0 OR coalesce(ord.total_qty,0)<=0 THEN missing := 'Missing positive consumption or order quantity'; END IF;
        required_qty := rate * ord.total_qty;
      ELSE
        FOR group_row IN
          SELECT g.group_name, coalesce(sum(b.qty),0) qty
          FROM public.size_groups g LEFT JOIN public.size_group_breakdown b ON b.size_group_id=g.id
          WHERE g.order_id=ord.id GROUP BY g.group_name
        LOOP
          rate := nullif(CASE WHEN (item->>'shared')::boolean THEN item->>'rate'
            ELSE setup->'rates'->>group_row.group_name END,'')::numeric;
          IF rate IS NULL OR rate<=0 OR group_row.group_name IS NULL OR left(group_row.group_name,1)='_' OR group_row.qty<=0 THEN
            missing := 'Missing size-group consumption or quantity';
          ELSE
            required_qty := required_qty + rate * group_row.qty;
            rates := rates || jsonb_build_object(group_row.group_name,rate);
          END IF;
        END LOOP;
        IF required_qty<=0 THEN missing := 'Missing size-group breakdown or consumption'; END IF;
        rate := NULL;
      END IF;
      IF lib.category='Packing Trim' AND coalesce(lib.unit,'')='' THEN missing := 'Missing packing material unit'; END IF;
      IF lib.category='Packing Trim' AND lower(coalesce(lib.unit,'')) IN ('ctn','carton','cartons')
        AND NOT EXISTS (SELECT 1 FROM public.finishing_packs p WHERE p.order_id=ord.id) THEN
        missing := 'Missing packing breakdown for carton material';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(saved.draft->'materials') x WHERE x->>'id'=item->>'id' OFFSET 1) THEN
        RAISE EXCEPTION 'A material is listed more than once';
      END IF;
      SELECT count(*) INTO matches FROM public.bom_items b WHERE b.order_id=ord.id AND
        (b.library_item_id=lib.id OR (b.library_item_id IS NULL AND b.category=lib.category AND lower(trim(b.name))=lower(trim(lib.name))));
      SELECT * INTO old_line FROM public.bom_items b WHERE b.order_id=ord.id AND
        (b.library_item_id=lib.id OR (b.library_item_id IS NULL AND b.category=lib.category AND lower(trim(b.name))=lower(trim(lib.name))))
        ORDER BY b.id LIMIT 1;
      IF matches>1 THEN missing := 'Multiple existing matches. Resolve them in the Order Wizard'; END IF;
      -- An existing order keeps its allowance and unrelated line fields.
      wastage_rate := coalesce(old_line.wastage,wastage_rate);
      IF old_line.use_cutting_qty THEN
        missing := 'Existing line uses cutting quantity. Review it in the Order Wizard';
      END IF;
      candidate := jsonb_build_object('library_item_id',lib.id,'name',lib.name,'category',lib.category,
        'detail',nullif(spec,''),'specification',shade,'unit',lib.unit,'usage_rule',rule,
        'usage_data', CASE WHEN rates='{}'::jsonb THEN NULL ELSE rates END,
        'base_qty',rate,'final_qty',round(required_qty * (1+wastage_rate/100),1),'wastage',wastage_rate);
      old_rates := old_line.usage_data;
      IF jsonb_typeof(old_rates)='string' THEN
        BEGIN
          old_rates := (old_rates #>> '{}')::jsonb;
        EXCEPTION WHEN invalid_text_representation THEN
          missing := 'Existing consumption could not be read. Review it in the Order Wizard';
        END;
      END IF;
      action := CASE WHEN missing IS NOT NULL THEN 'Blocked' WHEN matches=0 THEN 'Add'
        WHEN coalesce(old_line.detail,'')=spec AND coalesce(old_line.specification,'')=coalesce(shade,'')
         AND old_line.unit IS NOT DISTINCT FROM lib.unit AND coalesce(old_line.usage_rule,'Generic')=rule
         AND old_line.base_qty IS NOT DISTINCT FROM rate
         AND coalesce(nullif(old_rates,'null'::jsonb),'{}'::jsonb)=rates
         AND old_line.final_qty IS NOT DISTINCT FROM (candidate->>'final_qty')::numeric THEN 'Unchanged'
        ELSE 'Replace' END;
      review := review || jsonb_build_array(jsonb_build_object('style',ord.style_number,'order_id',ord.id,
        'po',ord.po_number,'store',ord.store_name,'action',action,'issue',missing,
        'before',CASE WHEN matches=1 THEN to_jsonb(old_line) END,'after',candidate));
    END LOOP;
  END LOOP;
  IF NOT (selected_styles <@ matched_styles) THEN RAISE EXCEPTION 'A selected style has no orders for this buyer'; END IF;
  IF expected IS NULL THEN RETURN review; END IF;
  IF review IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Orders or BOM lines changed. Review again before applying'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(review) x WHERE x->>'action'='Blocked') THEN
    RAISE EXCEPTION 'Resolve blocked lines before applying these styles';
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(review) LOOP
    candidate := entry->'after';
    SELECT * INTO typed_line FROM jsonb_populate_record(NULL::public.bom_items,candidate);
    IF entry->>'action'='Add' THEN
      SELECT coalesce(max(sort_order),-1)+1 INTO next_sort FROM public.bom_items WHERE order_id=(entry->>'order_id')::uuid;
      INSERT INTO public.bom_items (order_id,library_item_id,name,category,detail,specification,unit,
        usage_rule,usage_data,base_qty,final_qty,wastage,sort_order,use_cutting_qty)
      VALUES ((entry->>'order_id')::uuid,(candidate->>'library_item_id')::uuid,candidate->>'name',candidate->>'category',
        candidate->>'detail',candidate->>'specification',candidate->>'unit',candidate->>'usage_rule',
        typed_line.usage_data,(candidate->>'base_qty')::numeric,(candidate->>'final_qty')::numeric,
        (candidate->>'wastage')::numeric,next_sort,false);
    ELSIF entry->>'action'='Replace' AND (entry->'before'->>'id')::uuid=ANY(replace_lines) THEN
      UPDATE public.bom_items SET detail=candidate->>'detail',specification=candidate->>'specification',
        unit=candidate->>'unit',usage_rule=candidate->>'usage_rule',usage_data=typed_line.usage_data,
        base_qty=(candidate->>'base_qty')::numeric,final_qty=(candidate->>'final_qty')::numeric
      WHERE id=(entry->'before'->>'id')::uuid;
    END IF;
  END LOOP;
  UPDATE public.orders SET step_bom=true WHERE id IN (
    SELECT (record->>'order_id')::uuid FROM jsonb_array_elements(review) AS record
    WHERE record->>'action'='Add' OR (
      record->>'action'='Replace' AND (record->'before'->>'id')::uuid=ANY(replace_lines)
    )
  );
  UPDATE public.bulk_bom_drafts SET applied_at=now() WHERE id=draft_id;
  RETURN review;
END;
$$;
REVOKE ALL ON FUNCTION public.bulk_bom_review(uuid,text[],jsonb,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_bom_review(uuid,text[],jsonb,uuid[]) TO anon,authenticated;
