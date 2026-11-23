CREATE OR REPLACE FUNCTION public.bulk_bom_review_web(draft_id uuid, selected_styles text[], expected jsonb DEFAULT NULL,
  replace_lines uuid[] DEFAULT '{}', remove_lines uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  planned jsonb;
  reviewed jsonb;
  saved public.bulk_bom_drafts%ROWTYPE;
  removals uuid[];
BEGIN
  SELECT * INTO STRICT saved FROM public.bulk_bom_drafts WHERE id=draft_id FOR UPDATE;
  IF expected IS NOT NULL THEN
    LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;
    LOCK TABLE public.size_groups, public.size_group_colors, public.size_group_breakdown, public.library_items, public.finishing_packs IN SHARE MODE;
    LOCK TABLE public.bom_items IN SHARE ROW EXCLUSIVE MODE;
  END IF;
  -- The existing review checks permissions, buyer, materials and style scope.
  planned := public.bulk_bom_review(draft_id,selected_styles);
  WITH rows AS (
    SELECT value AS entry, ordinality AS position FROM jsonb_array_elements(planned) WITH ORDINALITY
    UNION ALL
    SELECT jsonb_build_object('style',o.style_number,'order_id',o.id,'po',o.po_number,'store',o.store_name,
      'action',CASE WHEN coalesce(saved.draft->'replaceStyles','[]') ? o.style_number THEN 'Remove' ELSE 'Keep' END,
      'before',to_jsonb(b),'after',NULL), NULL::bigint
    FROM public.orders o JOIN public.bom_items b ON b.order_id=o.id
    WHERE o.buyer_id=saved.buyer_id AND o.style_number=ANY(selected_styles)
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(planned) p WHERE p->'before'->>'id'=b.id::text)
  )
  SELECT coalesce(jsonb_agg(entry ORDER BY entry->>'style', entry->>'order_id',position,entry->'before'->>'id'),'[]')
    INTO reviewed FROM rows;
  IF expected IS NULL THEN RETURN reviewed; END IF;
  IF reviewed IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Orders or BOM lines changed. Refresh the review before applying'; END IF;
  SELECT coalesce(array_agg((e->'before'->>'id')::uuid),'{}') INTO removals
    FROM jsonb_array_elements(reviewed) e WHERE e->>'action'='Remove';
  IF remove_lines IS NULL OR NOT (remove_lines <@ removals AND removals <@ remove_lines) THEN
    RAISE EXCEPTION 'Confirm the reviewed removals before applying';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(planned) e WHERE e->>'action'='Replace'
    AND coalesce(saved.draft->'replaceStyles','[]') ? (e->>'style')
    AND NOT ((e->'before'->>'id')::uuid=ANY(coalesce(replace_lines,'{}')))) THEN
    RAISE EXCEPTION 'Confirm all replacements for a whole BOM replacement';
  END IF;
  PERFORM public.bulk_bom_review(draft_id,selected_styles,planned,replace_lines);
  DELETE FROM public.bom_items WHERE id=ANY(removals);
  RETURN reviewed;
END;
$$;
REVOKE ALL ON FUNCTION public.bulk_bom_review_web(uuid,text[],jsonb,uuid[],uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_bom_review_web(uuid,text[],jsonb,uuid[],uuid[]) TO anon,authenticated;
