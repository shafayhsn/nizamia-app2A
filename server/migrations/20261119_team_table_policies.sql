-- Existing grants still apply. Restrictive policies intersect with any pre-existing policies.
CREATE FUNCTION public.team_can_access(area text,verb text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT FROM nzos_private.edit_sessions e JOIN public.users u ON u.id=e.user_id
 LEFT JOIN public.permissions p ON p.role_id=u.role_id AND p.module=area
 WHERE e.proof_hash=sha256(convert_to(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-nzos-edit-proof','UTF8'))
 AND e.expires_at>now() AND u.is_active AND NOT coalesce(u.is_restricted,false) AND u.deleted_at IS NULL
 AND (u.role='admin' OR (area<>'settings' AND p.can_view AND CASE verb WHEN 'view' THEN true WHEN 'create' THEN p.can_create WHEN 'edit' THEN p.can_edit WHEN 'delete' THEN p.can_delete ELSE false END)));
$$;
REVOKE ALL ON FUNCTION public.team_can_access(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_can_access(text,text) TO anon,authenticated;
DO $$ DECLARE grp record; tab text; cmd text; verb text; cond text; clause text; existing boolean;
BEGIN
 FOR grp IN SELECT * FROM (VALUES
('orders','jobs orders size_groups size_group_colors size_group_breakdown order_processes order_queues bom_items fitting fitting_blocks washing embellishments finishing finishing_packs finishing_color_packing packing_snapshots'),
('buyers','buyers buyer_addresses buyer_contacts'),
('suppliers','suppliers'),
('sampling','samples sample_logs sample_comments'),
('parcels','parcels parcel_invoice_snapshots parcel_status_history'),
('production','production_batches production_batch_orders production_daily_entries'),
('purchasing','work_orders work_order_items work_order_changelog testing_orders testing_requirements'),
('shipping','shipments shipment_lines shipping_bookings shipping_booking_lines shipping_booking_shipments'),
('features/costing','costing_sheets costing_batches costing_sheet_versions'),
('reports/pp-meeting','pp_meetings'),
('library','library_items bom_presets bom_preset_items size_group_templates'),
('features','feature_assets feature_certificates'),
('reports','proforma_invoices proforma_invoice_revisions'),
('settings','settings app_settings counters document_numbering uoms ui_status_colors exchange_rates'),
('tasks','app_tasks app_task_comments')
 ) g(area,tables) LOOP
 FOREACH tab IN ARRAY string_to_array(grp.tables,' ') LOOP
   IF to_regclass(format('public.%I',tab)) IS NULL THEN RAISE EXCEPTION 'Missing table %',tab; END IF;
   SELECT relrowsecurity INTO existing FROM pg_class WHERE oid=to_regclass(format('public.%I',tab));
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
   FOREACH cmd IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
     verb:=CASE cmd WHEN 'SELECT' THEN 'view' WHEN 'INSERT' THEN 'create' WHEN 'UPDATE' THEN 'edit' ELSE 'delete' END;
     cond:=format('(SELECT public.team_can_access(%L,%L))',grp.area,verb);
     clause:=CASE cmd WHEN 'INSERT' THEN 'WITH CHECK ('||cond||')' WHEN 'UPDATE' THEN 'USING ('||cond||') WITH CHECK ('||cond||')' ELSE 'USING ('||cond||')' END;
     EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO anon,authenticated %s','team_guard_'||verb,tab,cmd,clause);
     IF NOT existing THEN
       EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO anon,authenticated %s','team_access_'||verb,tab,cmd,clause);
     END IF;
   END LOOP;
   EXECUTE format('REVOKE TRUNCATE,TRIGGER,REFERENCES ON public.%I FROM PUBLIC,anon,authenticated',tab);
 END LOOP;
 END LOOP;
END $$;
