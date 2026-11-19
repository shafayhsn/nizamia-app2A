BEGIN; DO $$ DECLARE uid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); rev bigint; p jsonb; b jsonb; BEGIN
insert into public.users(id,username,role,is_active,is_restricted) values(uid,'qa-'||uid,'admin',true,false);
insert into public.samples(id,stage) values(sid,'Pattern');
select (public.nzos_sync_page(null)->>'revision')::bigint into rev;
update public.samples set stage='Cutting' where id=sid;
p:=public.nzos_sync_page(rev); if p->'changes'<>jsonb_build_array(jsonb_build_array('samples',sid,true)) then raise exception 'Incorrect sample delta %',p;end if;
if jsonb_array_length(public.nzos_sync_page((p->>'revision')::bigint)->'changes')<>0 then raise exception 'Idle check has data';end if;
perform public.open_edit_session(uid,repeat('c',64),now()+interval '5 minutes');
perform set_config('request.headers',jsonb_build_object('x-nzos-edit-proof',repeat('c',64))::text,true);
if public.nzos_read_version() is null then raise exception 'No web revision';end if;
b:=public.nzos_dashboard_summary(current_date,2026,'2026-01-01','2026-12-31','2026-01-01','2026-12-31');
if b is null or not(b ? 'months') then raise exception 'Missing dashboard';end if;
delete from public.samples where id=sid; if (public.nzos_sync_page((p->>'revision')::bigint)->'changes')<>jsonb_build_array(jsonb_build_array('samples',sid,true)) then raise exception 'Missing removal';end if;
END $$;select 'passed' as sample_delta_delete_idle_and_dashboard;rollback;
