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
      CASE WHEN rule IN ('By Batch','Configure Own') THEN size END AS size,
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
      SELECT count(*), (jsonb_agg(jsonb_build_object('value',effective.cell->'consumption','na',effective.cell->'na'))->0) AS cell
      FROM jsonb_array_elements(CASE WHEN rule='Configure Own' THEN coalesce(rates->'__matrix','[]') ELSE '[]' END) m
      CROSS JOIN LATERAL (SELECT coalesce((
        SELECT o FROM jsonb_array_elements(coalesce(m->'overrides','[]')) o WHERE o->>'size'=b.size
      ),m) AS cell) effective
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
