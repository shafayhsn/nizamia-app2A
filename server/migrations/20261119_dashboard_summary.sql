-- Read through the caller's existing row permissions.
CREATE FUNCTION public.nzos_historical_shipping(notes text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE encoded text; doc jsonb; qty numeric; etd date;
BEGIN
 encoded:=substring(notes from '\[\[APP2A_SHIPPING_META:([A-Za-z0-9+/=]+)\]\]');
 doc:=(CASE WHEN encoded IS NULL THEN notes ELSE convert_from(decode(encoded,'base64'),'UTF8') END)::jsonb->'historical';
 qty:=nullif(doc->>'qty','')::numeric; etd:=nullif(doc->>'etd','')::date;
 RETURN jsonb_build_object('qty',qty,'etd',etd);
EXCEPTION WHEN data_exception THEN RETURN '{}'::jsonb;
END $$;
CREATE FUNCTION public.nzos_dashboard_summary(day date,chart_year integer,buyer_start date,buyer_end date,ots_start date,ots_end date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
WITH active AS (SELECT * FROM public.orders WHERE coalesce(status,'') NOT IN ('Cancelled','Shipped','Completed')),
open_samples AS (SELECT * FROM public.samples WHERE lower(coalesce(nullif(status,''),approval_status,'')) NOT IN ('completed','approved','cancelled')),
top_buyers AS (SELECT trim(buyer_name) buyer,sum(coalesce(total_value_usd,0)) val FROM public.orders
 WHERE coalesce(status,'')<>'Cancelled' AND nullif(trim(buyer_name),'') IS NOT NULL
 AND coalesce(po_date,ship_date,planned_date) BETWEEN buyer_start AND buyer_end
 GROUP BY 1 ORDER BY 2 DESC,1 LIMIT 5),
pairs AS (SELECT DISTINCT shipment_id,order_id FROM public.shipment_lines),
delays AS (SELECT greatest(0,s.shipment_date-o.ship_date) delay FROM pairs JOIN public.orders o ON o.id=pairs.order_id
 JOIN public.shipments s ON s.id=pairs.shipment_id WHERE o.ship_date IS NOT NULL AND coalesce(o.status,'')<>'Cancelled' AND s.shipment_date BETWEEN ots_start AND ots_end),
sh AS MATERIALIZED (SELECT s.*,public.nzos_historical_shipping(notes) hist FROM public.shipments s),
volumes AS (
 SELECT coalesce(s.etd,(s.hist->>'etd')::date,s.shipment_date) d,coalesce(nullif((s.hist->>'qty')::numeric,0),l.qty,0) actual,0 remaining
 FROM sh s LEFT JOIN (SELECT shipment_id,sum(greatest(0,shipped_qty)) qty FROM public.shipment_lines GROUP BY 1) l ON l.shipment_id=s.id
 UNION ALL
 SELECT coalesce(o.ship_date,o.planned_date),0,greatest(0,o.total_qty-coalesce(l.qty,0)) FROM active o
 LEFT JOIN (SELECT order_id,sum(greatest(0,shipped_qty)) qty FROM public.shipment_lines GROUP BY 1) l ON l.order_id=o.id),
monthly AS (SELECT extract(month from d)::int-1 AS "month",sum(actual) actual,sum(remaining) remaining FROM volumes WHERE extract(year from d)=chart_year GROUP BY 1)
SELECT jsonb_build_object('active',(SELECT count(*) FROM active),'totalQty',(SELECT coalesce(sum(total_qty),0) FROM active),
'shipsWeek',(SELECT count(*) FROM active WHERE ship_date BETWEEN day AND day+7),'shipsMonth',(SELECT count(*) FROM active WHERE ship_date BETWEEN day AND (date_trunc('month',day)+interval '1 month - 1 day')::date),
'samplesWeek',(SELECT count(*) FROM open_samples WHERE due_date BETWEEN day AND day+7),'overdue',(SELECT count(*) FROM open_samples WHERE due_date<day),
'wip',(SELECT count(*) FROM public.samples WHERE lower(status) IN ('requested','pending')),
'buyers',coalesce((SELECT jsonb_agg(jsonb_build_array(buyer,val) ORDER BY val DESC,buyer) FROM top_buyers),'[]'),
'ots',(SELECT jsonb_build_object('count',count(*),'onTime',count(*) FILTER(WHERE delay=0),'average',coalesce(avg(delay) FILTER(WHERE delay>0),0)) FROM delays),
'months',coalesce((SELECT jsonb_agg(to_jsonb(monthly)) FROM monthly),'[]'))
WHERE public.team_can_access('dashboard','view')
$$;
