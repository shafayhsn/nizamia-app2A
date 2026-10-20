-- Apply in Supabase SQL Editor before deploying the matching application build.
-- This creates a save function only. It does NOT modify existing PO data.
create or replace function public.save_po_matrix_atomic(
  p_order_id uuid, p_groups jsonb, p_total_qty integer,
  p_total_value_usd numeric, p_excess_cutting_pct numeric,
  p_queue_split_rule text
) returns void language plpgsql security invoker set search_path = public as $$
declare
  g jsonb; c jsonb; b jsonb; v_gid uuid; v_cid uuid; v_order_qty integer := 0;
  v_total_value numeric := 0; v_price numeric; v_color_qty integer;
begin
  -- Serialize concurrent saves of the same order.
  perform 1 from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if jsonb_typeof(p_groups) is distinct from 'array' then raise exception 'Invalid PO Matrix payload'; end if;
  if exists (
    select 1 from (
      select lower(trim(g1->>'group_name')) as group_name, g1->'sizes' as sizes,
        (select string_agg(lower(trim(cc->>'color_name')), '|' order by lower(trim(cc->>'color_name')))
         from jsonb_array_elements(coalesce(g1->'colors','[]'::jsonb)) cc) as colors
      from jsonb_array_elements(p_groups) g1
    ) signatures group by group_name, sizes, colors having count(*) > 1
  ) then
    raise exception 'Duplicate size groups in submitted PO Matrix';
  end if;
  for g in select value from jsonb_array_elements(p_groups) loop
    v_price := coalesce((g->>'unit_price')::numeric,0);
    for c in select value from jsonb_array_elements(coalesce(g->'colors','[]'::jsonb)) loop
      v_color_qty := 0;
      for b in select value from jsonb_array_elements(coalesce(c->'quantities','[]'::jsonb)) loop
        if (b->>'qty')::integer < 0 then raise exception 'Negative quantity'; end if;
        v_color_qty := v_color_qty + (b->>'qty')::integer;
      end loop;
      v_order_qty := v_order_qty + v_color_qty;
      v_total_value := v_total_value + v_color_qty * v_price;
    end loop;
  end loop;
  if v_order_qty <> p_total_qty or abs(v_total_value - p_total_value_usd) > 0.01 then
    raise exception 'PO Matrix totals do not match submitted values';
  end if;
  delete from public.size_group_breakdown where size_group_id in (select id from public.size_groups where order_id=p_order_id);
  delete from public.size_group_colors where size_group_id in (select id from public.size_groups where order_id=p_order_id);
  delete from public.size_groups where order_id=p_order_id;
  for g in select value from jsonb_array_elements(p_groups) loop
    insert into public.size_groups(order_id,group_name,unit_price,currency,sizes,base_size,sort_order)
    values(p_order_id,g->>'group_name',(g->>'unit_price')::numeric,coalesce(g->>'currency','USD'),
      array(select jsonb_array_elements_text(g->'sizes')),g->>'base_size',(g->>'sort_order')::integer)
    returning id into v_gid;
    for c in select value from jsonb_array_elements(coalesce(g->'colors','[]'::jsonb)) loop
      insert into public.size_group_colors(size_group_id,color_name,sort_order,ratio_override,ratio_locked)
      values(v_gid,c->>'color_name',(c->>'sort_order')::integer,c->'ratio_override',coalesce((c->>'ratio_locked')::boolean,false))
      returning id into v_cid;
      for b in select value from jsonb_array_elements(coalesce(c->'quantities','[]'::jsonb)) loop
        insert into public.size_group_breakdown(size_group_id,color_id,size,qty)
        values(v_gid,v_cid,b->>'size',(b->>'qty')::integer);
      end loop;
    end loop;
  end loop;
  update public.orders set step_po_matrix=true,total_qty=p_total_qty,total_value_usd=p_total_value_usd,
    excess_cutting_pct=p_excess_cutting_pct,queue_split_rule=p_queue_split_rule where id=p_order_id;
end $$;
grant execute on function public.save_po_matrix_atomic(uuid,jsonb,integer,numeric,numeric,text) to authenticated;
