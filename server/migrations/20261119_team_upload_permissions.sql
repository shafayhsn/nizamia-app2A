-- Authorization is checked inside the transaction that applies each offline change.
CREATE OR REPLACE FUNCTION desktop_private.team_permission(actor uuid,area text,verb text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT FROM public.users u JOIN public.permissions p ON p.role_id=u.role_id
 WHERE u.id=actor AND u.is_active AND NOT coalesce(u.is_restricted,false) AND u.deleted_at IS NULL
 AND p.module=area AND p.can_view AND CASE verb WHEN 'create' THEN p.can_create WHEN 'edit' THEN p.can_edit WHEN 'delete' THEN p.can_delete ELSE false END);
$$;
REVOKE ALL ON FUNCTION desktop_private.team_permission(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION desktop_private.team_permission(uuid,text,text) TO service_role;
DO $$ DECLARE spec record; routine regprocedure; definition text;
BEGIN
 FOR spec IN SELECT * FROM (VALUES
('desktop_apply_order_note',$old$u.role = 'admin'$old$,$new$(u.role = 'admin' OR desktop_private.team_permission(actor,'orders','edit'))$new$),
('desktop_update_order_details',$old$u.role='admin'$old$,$new$(u.role='admin' OR desktop_private.team_permission(actor,'orders','edit'))$new$),
('desktop_update_order_general',$old$u.role='admin'$old$,$new$(u.role='admin' OR desktop_private.team_permission(actor,'orders','edit'))$new$),
('desktop_update_order_job',$old$u.role='admin'$old$,$new$(u.role='admin' OR desktop_private.team_permission(actor,'orders','edit'))$new$),
('desktop_update_order_status',$old$u.role='admin'$old$,$new$(u.role='admin' OR desktop_private.team_permission(actor,'orders','edit'))$new$),
('desktop_save_order_section',$old$u.role='admin'$old$,$new$(u.role='admin' OR desktop_private.team_permission(actor,'orders','edit'))$new$),
('desktop_save_finishing',$old$u.role='admin'$old$,$new$(u.role='admin' OR desktop_private.team_permission(actor,'orders','edit'))$new$),
('desktop_save_bom',$old$u.role='admin'$old$,$new$(u.role='admin' OR desktop_private.team_permission(actor,'orders','edit'))$new$),
('desktop_save_po_matrix',$old$u.role='admin'$old$,$new$(u.role='admin' OR desktop_private.team_permission(actor,'orders','edit'))$new$),
('desktop_copy_order_sections',$old$u.role='admin'$old$,$new$(u.role='admin' OR desktop_private.team_permission(actor,'orders','edit'))$new$),
('desktop_create_and_assign_job',$old$u.role='admin'$old$,$new$(u.role='admin' OR desktop_private.team_permission(actor,'orders','edit'))$new$),
('desktop_create_order',$old$u.role='admin'$old$,$new$(u.role='admin' OR desktop_private.team_permission(actor,'orders','create'))$new$),
('desktop_duplicate_order',$old$u.role='admin'$old$,$new$(u.role='admin' OR desktop_private.team_permission(actor,'orders','create'))$new$),
('desktop_import_orders',$old$u.role='admin'$old$,$new$(u.role='admin' OR desktop_private.team_permission(actor,'orders','create'))$new$),
('desktop_save_supplier',$old$u.role='admin'$old$,$new$(u.role='admin' OR desktop_private.team_permission(actor,'suppliers',CASE WHEN target_supplier IS NULL THEN 'create' ELSE 'edit' END))$new$),
('desktop_save_buyer',$old$u.role='admin'$old$,$new$(u.role='admin' OR desktop_private.team_permission(actor,'buyers',CASE WHEN target_buyer IS NULL THEN 'create' ELSE 'edit' END))$new$),
('desktop_create_production_entry',$old$u.role = 'admin'$old$,$new$(u.role = 'admin' OR desktop_private.team_permission(actor,'production','create'))$new$),
('desktop_change_sampling_parcel',$old$u.role='admin'$old$,$new$(u.role='admin' OR desktop_private.team_permission(actor,CASE WHEN kind IN ('samples','sample_comments') THEN 'sampling' WHEN kind IN ('parcels','parcel_invoice_snapshots') THEN 'parcels' END,CASE WHEN verb='update' THEN 'edit' ELSE verb END))$new$),
('desktop_create_parcel',$old$u.role='admin'$old$,$new$(u.role='admin' OR desktop_private.team_permission(actor,'parcels','create'))$new$),
('desktop_transition_parcel',$old$u.role='admin'$old$,$new$(u.role='admin' OR desktop_private.team_permission(actor,'parcels','edit'))$new$),
('desktop_update_shipment_status',$old$u.role='admin'$old$,$new$(u.role='admin' OR desktop_private.team_permission(actor,'shipping','edit'))$new$),
('desktop_save_operational_record',$old$u.role='admin'$old$,$new$(u.role='admin' OR desktop_private.team_permission(actor,CASE WHEN kind='batch' THEN 'production' WHEN kind IN ('booking','shipment') AND NOT payload ? 'payment' AND NOT (kind='shipment' AND verb='delete') THEN 'shipping' END,CASE WHEN verb='delete' THEN 'delete' WHEN kind='batch' THEN 'edit' WHEN expected->'header'='null' THEN 'create' ELSE 'edit' END))$new$),
('desktop_save_business_document',$old$role='admin'$old$,$new$(role='admin' OR desktop_private.team_permission(actor,CASE kind WHEN 'costing' THEN 'features/costing' WHEN 'costingAssignment' THEN 'features/costing' WHEN 'meeting' THEN 'reports/pp-meeting' WHEN 'trimPackage' THEN 'library' END,CASE WHEN verb='delete' THEN 'delete' WHEN kind='costingAssignment' THEN 'edit' WHEN expected->'before'='null' THEN 'create' ELSE 'edit' END))$new$),
('desktop_save_catalog_record',$old$role='admin'$old$,$new$(role='admin' OR desktop_private.team_permission(actor,CASE kind WHEN 'library_items' THEN 'library' WHEN 'size_group_templates' THEN 'library' WHEN 'pp_meetings' THEN 'reports/pp-meeting' WHEN 'costing_batches' THEN 'features/costing' END,CASE WHEN expected->'previous'='null' THEN 'create' ELSE 'edit' END))$new$)
 ) AS rules(name,original,replacement)
 LOOP
   SELECT p.oid INTO STRICT routine FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=spec.name;
   SELECT pg_get_functiondef(routine) INTO definition;
   IF strpos(definition,spec.replacement)>0 THEN CONTINUE; END IF;
   IF array_length(string_to_array(definition,spec.original),1)<>2 THEN
     RAISE EXCEPTION 'Review % before changing its permission check',routine;
   END IF;
   EXECUTE replace(definition,spec.original,spec.replacement);
 END LOOP;
END $$;
