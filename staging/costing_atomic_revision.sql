-- Staged for review. Do not apply to production until preview isolation is confirmed.
-- Atomic costing save and revision archive. Requires authenticated user.
create or replace function public.save_costing_revision(
  p_id uuid, p_expected_version integer, p_customer text, p_buyer_id uuid,
  p_style text, p_document jsonb
) returns public.costing_sheets
language plpgsql security invoker set search_path = public
as $$
declare v_previous public.costing_sheets; v_updated public.costing_sheets;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_previous from public.costing_sheets where id=p_id for update;
  if not found then raise exception 'Costing not found'; end if;
  if v_previous.version <> p_expected_version then raise exception 'Costing changed by another user. Reload before saving'; end if;
  insert into public.costing_sheet_versions(costing_id,version,document)
  values(v_previous.id,v_previous.version,v_previous.document);
  update public.costing_sheets set
    customer=p_customer,buyer_id=p_buyer_id,style=p_style,document=p_document,
    version=version+1,updated_at=now()
  where id=p_id returning * into v_updated;
  return v_updated;
end $$;
-- Existing app permissions must be reviewed before granting RPC/table access.
