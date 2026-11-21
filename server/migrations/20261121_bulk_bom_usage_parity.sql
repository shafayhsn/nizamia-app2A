-- Resolve consumption against the current PO, while apply holds the same write locks as review.
CREATE OR REPLACE FUNCTION public.bulk_bom_matrix_usage(order_uuid uuid, rule text, rates jsonb, shared_rate numeric)
RETURNS TABLE(required_qty numeric, issue text)
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  WITH breakdown AS (
    SELECT g.group_name, c.color_name, b.size, b.qty, g.sizes,
      c.id IS NOT NULL AS valid_color
    FROM public.size_groups g
    JOIN public.size_group_breakdown b ON b.size_group_id=g.id
    LEFT JOIN public.size_group_colors c ON c.id=b.color_id AND c.size_group_id=g.id
    WHERE g.order_id=order_uuid
  ), buckets AS (
    SELECT CASE rule WHEN 'By Size Group' THEN group_name WHEN 'By Color' THEN color_name
      WHEN 'By Individual Sizes' THEN size ELSE group_name END AS label,
      CASE WHEN rule IN ('Configure Own','By Batch') THEN color_name END AS color,
      CASE WHEN rule='By Batch' THEN size END AS size,
      sum(qty) AS qty,
      bool_or(CASE WHEN rule='By Size Group' THEN group_name IS NULL OR left(group_name,1)='_'
        WHEN rule='By Color' THEN NOT valid_color OR coalesce(color_name,'')='' OR left(color_name,1)='_'
        WHEN rule='By Individual Sizes' THEN size IS NULL OR left(size,1)='_' OR NOT coalesce(size=ANY(sizes),false)
        ELSE coalesce(group_name,'')='' OR coalesce(color_name,'')='' OR NOT valid_color
          OR NOT coalesce(size=ANY(sizes),false) END) AS invalid
    FROM breakdown
    GROUP BY 1,2,3
    HAVING sum(qty)>0
  ), mappings AS (
    SELECT b.*, CASE
      WHEN rule='By Batch' THEN batch.count
      WHEN rule='Configure Own' AND shared_rate IS NULL THEN matrix.count
      ELSE 1 END AS matches,
      CASE
        WHEN shared_rate IS NOT NULL THEN to_jsonb(shared_rate)
        WHEN rule='By Batch' THEN to_jsonb(batch.consumption)
        WHEN rule='Configure Own' THEN matrix.cell
        ELSE rates->b.label END AS cell
    FROM buckets b
    LEFT JOIN LATERAL (
      SELECT count(*), min(batch->>'consumption') AS consumption
      FROM jsonb_array_elements(CASE WHEN rule='By Batch' THEN coalesce(rates->'__batches','[]') ELSE '[]' END) batch
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(batch->'cells','[]')) assignment
      WHERE assignment->>'sgName'=b.label AND assignment->>'colorName'=b.color
        AND (nullif(assignment->>'size','') IS NULL OR assignment->>'size'=b.size)
    ) batch ON rule='By Batch'
    LEFT JOIN LATERAL (
      SELECT count(*), (jsonb_agg(jsonb_build_object('value',m->'consumption','na',m->'na'))->0) AS cell
      FROM jsonb_array_elements(CASE WHEN rule='Configure Own' THEN coalesce(rates->'__matrix','[]') ELSE '[]' END) m
      WHERE m->>'sgName'=b.label AND m->>'colorName'=b.color
    ) matrix ON rule='Configure Own'
  ), consumption AS (
    SELECT *, coalesce((cell->>'na')::boolean,false) AS excluded,
      nullif(CASE WHEN jsonb_typeof(cell)='object' THEN cell->>'value' ELSE cell #>> '{}' END,'')::numeric AS rate
    FROM mappings
  )
  SELECT sum(CASE WHEN excluded THEN 0 ELSE qty*rate END),
    CASE WHEN count(*)=0 THEN 'Missing PO matrix breakdown'
      WHEN count(*) FILTER (WHERE invalid OR matches<>1 OR (NOT excluded AND coalesce(rate,0)<=0))>0
      THEN 'Missing or overlapping consumption for ' ||
        string_agg(coalesce(nullif(concat_ws(' / ',label,color,size),''),'unnamed matrix entry'), ', ' ORDER BY label,color,size)
        FILTER (WHERE invalid OR matches<>1 OR (NOT excluded AND coalesce(rate,0)<=0))
    END
  FROM consumption;
$$;
REVOKE ALL ON FUNCTION public.bulk_bom_matrix_usage(uuid,text,jsonb,numeric) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.bulk_bom_review(draft_id uuid, selected_styles text[], expected jsonb DEFAULT NULL, replace_lines uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  saved public.bulk_bom_drafts%ROWTYPE;
  ord public.orders%ROWTYPE;
  lib public.library_items%ROWTYPE;
  item jsonb; setup jsonb; spec text; shade text; rule text; rate numeric; required_qty numeric;
  rates jsonb; missing text; wastage_rate numeric; shared_rate numeric; requested_wastage numeric;
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
    LOCK TABLE public.size_groups, public.size_group_colors, public.size_group_breakdown, public.library_items, public.finishing_packs IN SHARE MODE;
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
      IF rule IS NULL OR rule NOT IN ('Generic','By Color','By Size Group','By Individual Sizes','Configure Own','By Batch') THEN RAISE EXCEPTION 'Invalid material usage'; END IF;
      setup := item->'settings'->ord.style_number;
      spec := coalesce(setup->>'spec',CASE WHEN lib.category='Fabric'
        THEN concat_ws(', ',nullif(lib.composition,''),nullif(lib.weight::text,''),nullif(lib.width_inches::text,'')||'"')
        ELSE lib.description END,'');
      shade := CASE WHEN lib.category='Fabric' THEN nullif(lib.colour,'') END;
      requested_wastage := nullif(setup->>'wastage','')::numeric;
      wastage_rate := coalesce(nullif(lib.default_wastage,0),5);
      shared_rate := CASE WHEN rule<>'By Batch' AND (item->>'shared')::boolean
        THEN coalesce(nullif(item->>'rate','')::numeric,0) END;
      rates := CASE WHEN nullif(lib.packing_form,'') IS NULL THEN '{}'::jsonb
        ELSE jsonb_build_object('_packing_unit',lib.packing_form) END;
      rates := rates || coalesce(setup->'usageData', CASE WHEN rule='By Size Group' THEN setup->'rates' END, '{}'::jsonb);
      required_qty := NULL; missing := NULL; rate := NULL;
      IF rule='Generic' THEN
        rate := coalesce(shared_rate, nullif(rates->'generic'->>'value','')::numeric, nullif(setup->>'rate','')::numeric);
        IF shared_rate IS NOT NULL THEN rates := rates - 'generic'; END IF;
        IF coalesce((rates->'generic'->>'na')::boolean,false) THEN
          rate := NULL;
        ELSIF coalesce(rate,0)<=0 OR coalesce(ord.total_qty,0)<=0 THEN
          missing := 'Missing positive consumption or order quantity';
        ELSE
          required_qty := rate * ord.total_qty;
        END IF;
      ELSE
        SELECT usage.required_qty, usage.issue INTO required_qty, missing
        FROM public.bulk_bom_matrix_usage(ord.id,rule,rates,shared_rate) usage;
        IF shared_rate IS NOT NULL THEN
          -- Save the same per-key inputs that the Order Wizard uses when reopening a PO.
          IF rule='Configure Own' THEN
            rates := (rates - '__matrix') || jsonb_build_object('__matrix',coalesce((
              SELECT jsonb_agg(jsonb_build_object('sgName',keys.group_name,'colorName',keys.color_name,
                'consumption',shared_rate,'na',false) ORDER BY keys.group_name,keys.color_name)
              FROM (SELECT DISTINCT g.group_name,c.color_name FROM public.size_groups g
                JOIN public.size_group_colors c ON c.size_group_id=g.id WHERE g.order_id=ord.id) keys
            ),'[]'::jsonb));
          ELSE
            rates := (SELECT coalesce(jsonb_object_agg(key,value),'{}') FROM jsonb_each(rates) WHERE left(key,1)='_') ||
              coalesce((SELECT jsonb_object_agg(label, jsonb_build_object('value',shared_rate,'na',false))
                FROM (SELECT DISTINCT CASE rule WHEN 'By Color' THEN c.color_name
                    WHEN 'By Size Group' THEN g.group_name ELSE s.size END AS label
                  FROM public.size_groups g
                  LEFT JOIN public.size_group_colors c ON c.size_group_id=g.id AND rule='By Color'
                  LEFT JOIN LATERAL unnest(g.sizes) s(size) ON rule='By Individual Sizes'
                  WHERE g.order_id=ord.id) keys WHERE label IS NOT NULL AND left(label,1)<>'_'),'{}');
          END IF;
        END IF;
        IF required_qty=0 THEN required_qty := NULL; END IF;
      END IF;
      IF requested_wastage<0 THEN missing := 'Wastage must be zero or greater'; END IF;
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
      wastage_rate := coalesce(requested_wastage,old_line.wastage,wastage_rate);
      IF old_line.use_cutting_qty THEN
        missing := 'Existing line uses cutting quantity. Review it in the Order Wizard';
      END IF;
      candidate := jsonb_build_object('library_item_id',lib.id,'name',lib.name,'category',lib.category,
        'detail',nullif(spec,''),'specification',shade,'unit',lib.unit,'usage_rule',rule,
        'usage_data', CASE WHEN rates='{}'::jsonb THEN NULL ELSE to_jsonb(rates::text) END,
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
         AND old_line.wastage IS NOT DISTINCT FROM wastage_rate
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
      INSERT INTO public.bom_items (id,order_id,library_item_id,name,category,detail,specification,unit,
        usage_rule,usage_data,base_qty,final_qty,wastage,sort_order,use_cutting_qty)
      VALUES (gen_random_uuid(),(entry->>'order_id')::uuid,(candidate->>'library_item_id')::uuid,candidate->>'name',candidate->>'category',
        candidate->>'detail',candidate->>'specification',candidate->>'unit',candidate->>'usage_rule',
        typed_line.usage_data,(candidate->>'base_qty')::numeric,(candidate->>'final_qty')::numeric,
        (candidate->>'wastage')::numeric,next_sort,false);
    ELSIF entry->>'action'='Replace' AND (entry->'before'->>'id')::uuid=ANY(replace_lines) THEN
      UPDATE public.bom_items SET detail=candidate->>'detail',specification=candidate->>'specification',
        unit=candidate->>'unit',usage_rule=candidate->>'usage_rule',usage_data=typed_line.usage_data,
        base_qty=(candidate->>'base_qty')::numeric,wastage=(candidate->>'wastage')::numeric,final_qty=(candidate->>'final_qty')::numeric
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
