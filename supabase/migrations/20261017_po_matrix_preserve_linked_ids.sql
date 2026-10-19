-- Phase 12: Preserve stable size-group and colour IDs referenced by Washing.
-- Apply before deploying the matching app build. No existing data is changed by installation.
create or replace function public.save_po_matrix_atomic(
  p_order_id uuid, p_groups jsonb, p_total_qty integer,
  p_total_value_usd numeric, p_excess_cutting_pct numeric,
  p_queue_split_rule text
) returns void language plpgsql security invoker set search_path = public as $$
declare
  g jsonb; c jsonb; b jsonb; v_gid uuid; v_cid uuid;
  v_order_qty integer := 0; v_total_value numeric := 0;
  v_price numeric; v_color_qty integer;
begin
  perform 1 from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if jsonb_typeof(p_groups) is distinct from 'array' then raise exception 'Invalid PO Matrix payload'; end if;
  if exists (
    select 1 from (
      select lower(trim(g1->>'group_name')) as group_name,g1->'sizes' as sizes,
        (select string_agg(lower(trim(cc->>'color_name')),'|' order by lower(trim(cc->>'color_name')))
         from jsonb_array_elements(coalesce(g1->'colors','[]'::jsonb)) cc) as colors
      from jsonb_array_elements(p_groups) g1
    ) signatures group by group_name,sizes,colors having count(*)>1
  ) then raise exception 'Duplicate size groups in submitted PO Matrix'; end if;
  -- Reject IDs from a different order or duplicated IDs within the submitted matrix.
  if exists (select 1 from jsonb_array_elements(p_groups) x
     where nullif(x->>'id','') is not null and not exists (
       select 1 from public.size_groups sg where sg.id=(x->>'id')::uuid and sg.order_id=p_order_id))
  then raise exception 'PO Matrix includes a size group not owned by this order'; end if;
  if exists (select 1 from (select x->>'id' id from jsonb_array_elements(p_groups) x) a
    where id is not null group by id having count(*)>1)
  then raise exception 'Duplicate size group ID'; end if;
  for g in select value from jsonb_array_elements(p_groups) loop
    v_price:=coalesce((g->>'unit_price')::numeric,0);
    for c in select value from jsonb_array_elements(coalesce(g->'colors','[]'::jsonb)) loop
      v_color_qty:=0;
      for b in select value from jsonb_array_elements(coalesce(c->'quantities','[]'::jsonb)) loop
        if (b->>'qty')::integer<0 then raise exception 'Negative quantity'; end if;
        v_color_qty:=v_color_qty+(b->>'qty')::integer;
      end loop;
      v_order_qty:=v_order_qty+v_color_qty;
      v_total_value:=v_total_value+v_color_qty*v_price;
    end loop;
  end loop;
  if v_order_qty<>p_total_qty or abs(v_total_value-p_total_value_usd)>0.01 then
    raise exception 'PO Matrix totals do not match submitted values';
  end if;
  -- Upsert groups without changing their primary keys.
  for g in select value from jsonb_array_elements(p_groups) loop
    v_price:=coalesce((g->>'unit_price')::numeric,0);
    v_gid:=nullif(g->>'id','')::uuid;
    if v_gid is null then
      insert into public.size_groups(order_id,group_name,unit_price,currency,sizes,base_size,sort_order)
      values(p_order_id,g->>'group_name',v_price,coalesce(g->>'currency','USD'),
        array(select jsonb_array_elements_text(g->'sizes')),g->>'base_size',(g->>'sort_order')::integer)
      returning id into v_gid;
    else
      update public.size_groups set group_name=g->>'group_name',unit_price=(g->>'unit_price')::numeric,
        currency=coalesce(g->>'currency','USD'),sizes=array(select jsonb_array_elements_text(g->'sizes')),
        base_size=g->>'base_size',sort_order=(g->>'sort_order')::integer where id=v_gid;
    end if;
    for c in select value from jsonb_array_elements(coalesce(g->'colors','[]'::jsonb)) loop
      v_cid:=nullif(c->>'id','')::uuid;
      if v_cid is not null and not exists (
        select 1 from public.size_group_colors where id=v_cid and size_group_id=v_gid
      ) then raise exception 'PO Matrix colour ID does not belong to its size group'; end if;
      if v_cid is null then
        insert into public.size_group_colors(size_group_id,color_name,sort_order,ratio_override,ratio_locked)
        values(v_gid,c->>'color_name',(c->>'sort_order')::integer,c->'ratio_override',coalesce((c->>'ratio_locked')::boolean,false))
        returning id into v_cid;
      else
        update public.size_group_colors set color_name=c->>'color_name',sort_order=(c->>'sort_order')::integer,
          ratio_override=c->'ratio_override',ratio_locked=coalesce((c->>'ratio_locked')::boolean,false)
        where id=v_cid;
      end if;
      delete from public.size_group_breakdown where color_id=v_cid;
      for b in select value from jsonb_array_elements(coalesce(c->'quantities','[]'::jsonb)) loop
        insert into public.size_group_breakdown(size_group_id,color_id,size,qty)
        values(v_gid,v_cid,b->>'size',(b->>'qty')::integer);
      end loop;
    end loop;
    -- Explicitly reject removal of linked colour records instead of deleting Washing data.
    if exists (select 1 from public.washing w join public.size_group_colors sc on sc.id=w.color_id
      where sc.size_group_id=v_gid and not exists (
        select 1 from jsonb_array_elements(coalesce(g->'colors','[]'::jsonb)) c2
        where nullif(c2->>'id','')::uuid=sc.id))
    then raise exception 'Cannot remove a colour linked to Washing. Update Washing first.'; end if;
    delete from public.size_group_colors sc where sc.size_group_id=v_gid and not exists (
      select 1 from jsonb_array_elements(coalesce(g->'colors','[]'::jsonb)) c2
      where nullif(c2->>'id','')::uuid=sc.id);
  end loop;
  -- Deleted groups with dependent records will be rejected by their FK constraints.
  delete from public.size_groups sg where sg.order_id=p_order_id and not exists (
    select 1 from jsonb_array_elements(p_groups) g2 where nullif(g2->>'id','')::uuid=sg.id);
  update public.orders set step_po_matrix=true,total_qty=p_total_qty,total_value_usd=p_total_value_usd,
    excess_cutting_pct=p_excess_cutting_pct,queue_split_rule=p_queue_split_rule where id=p_order_id;
end $$;
grant execute on function public.save_po_matrix_atomic(uuid,jsonb,integer,numeric,numeric,text) to authenticated;
