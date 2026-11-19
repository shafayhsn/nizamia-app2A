begin; grant select,update on public.samples to anon; grant select on public.buyers,public.payment_settlements to anon;
do $$ declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); proof text:=repeat('b',64); begin
insert into public.users(id,username,role,is_active,is_restricted) values(a,'qaadmin','admin',true,false),(b,'qaadmin2','admin',true,false),(m,'qastaff','merchandiser',true,false);
insert into public.roles(id,name) values(s,'qa-'||s);update public.users set role_id=s where id=m;insert into public.permissions(role_id,module,can_view,can_edit) values(s,'sampling',true,true);
insert into public.buyers(id) values(s);insert into public.samples(id,stage) values(s,'Pattern');
perform public.open_edit_session(m,proof,now()+interval '5 minutes');
perform set_config('request.headers',jsonb_build_object('x-nzos-edit-proof',proof)::text,true);
set local role anon; if exists(select from public.buyers where id=s) or public.is_verified_payment_admin() then raise exception 'restricted rows visible'; end if; update public.samples set stage='Cutting' where id=s; reset role;
if not exists(select from public.read_team_history(a,null) where user_id=m and record_id=s::text and stage_before='Pattern' and stage_after='Cutting') then raise exception 'missing edit'; end if;
begin perform public.retire_team_account(m,b); raise exception 'must deny'; exception when insufficient_privilege then null; end;
begin perform public.retire_team_account(a,a); raise exception 'self deletion'; exception when insufficient_privilege then null; end;
perform public.retire_team_account(a,m);
if exists(select from public.users where id=m and (is_active or deleted_at is null)) then raise exception 'retirement failed'; end if;
if exists(select from nzos_private.edit_sessions where user_id=m) then raise exception 'proof retained'; end if;
if not exists(select from public.read_team_history(a,null) where user_id=m and record_id=s::text and username='qastaff') then raise exception 'history lost'; end if;
end $$; select 'passed' as result; rollback;
