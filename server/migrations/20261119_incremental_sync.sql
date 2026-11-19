-- Commit-ordered record keys. No business values or photographs are copied into the journal.
CREATE TABLE nzos_private.sync_changes (
  revision bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  relation text NOT NULL, record_key text NOT NULL
);
REVOKE ALL ON nzos_private.sync_changes FROM PUBLIC,anon,authenticated;
CREATE FUNCTION nzos_private.record_sync_key() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog AS $$
DECLARE row_key text; previous_key text;
BEGIN
  PERFORM pg_advisory_xact_lock(39178320360291);
  IF TG_OP <> 'INSERT' THEN EXECUTE format('SELECT ($1).%I::text',TG_ARGV[0]) INTO previous_key USING OLD; END IF;
  IF TG_OP <> 'DELETE' THEN EXECUTE format('SELECT ($1).%I::text',TG_ARGV[0]) INTO row_key USING NEW; END IF;
  IF previous_key IS NOT NULL AND previous_key IS DISTINCT FROM row_key THEN
    INSERT INTO nzos_private.sync_changes(relation,record_key) VALUES(TG_TABLE_NAME,previous_key);
  END IF;
  IF row_key IS NOT NULL THEN INSERT INTO nzos_private.sync_changes(relation,record_key) VALUES(TG_TABLE_NAME,row_key); END IF;
  RETURN NULL;
END $$;
DO $$ DECLARE t text; k text;
BEGIN
 FOREACH t IN ARRAY string_to_array('buyers suppliers library_items bom_presets bom_preset_items jobs orders size_groups size_group_colors size_group_breakdown bom_items fitting samples washing embellishments finishing finishing_color_packing order_processes purchase_orders purchase_order_items purchase_order_changelog work_orders work_order_items work_order_changelog settings counters exchange_rates size_group_templates fitting_blocks finishing_packs order_queues sample_comments sample_logs shipments shipment_lines payment_settlements app_settings document_numbering uoms ui_status_colors packing_snapshots parcels production_batches production_batch_orders app_tasks app_task_comments production_daily_entries shipping_bookings shipping_booking_lines shipping_booking_shipments parcel_status_history buyer_addresses buyer_contacts parcel_invoice_snapshots testing_orders testing_requirements pp_meetings proforma_invoices proforma_invoice_revisions costing_sheets costing_sheet_versions costing_batches feature_assets feature_certificates users permissions roles po_approval_requests',' ') LOOP
   k:=CASE t WHEN 'settings' THEN 'key' WHEN 'counters' THEN 'key' WHEN 'production_batch_orders' THEN 'order_id' WHEN 'parcel_invoice_snapshots' THEN 'parcel_id' WHEN 'po_approval_requests' THEN 'po_id' ELSE 'id' END;
   EXECUTE format('CREATE TRIGGER nzos_sync_key AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION nzos_private.record_sync_key(%L)',t,k);
 END LOOP;
END $$;
CREATE FUNCTION public.nzos_sync_page(after_revision bigint) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH watermark AS (SELECT coalesce(max(revision),0) AS tip FROM nzos_private.sync_changes),
 page AS (SELECT revision,relation,record_key FROM nzos_private.sync_changes WHERE after_revision IS NOT NULL AND revision>after_revision ORDER BY revision LIMIT 301)
 SELECT jsonb_build_object('revision',tip,'reset',after_revision>tip OR (SELECT count(*)>300 FROM page),
 'changes',coalesce((SELECT jsonb_agg(jsonb_build_array(relation,record_key) ORDER BY revision) FROM page),'[]'::jsonb)) FROM watermark
$$;
REVOKE ALL ON FUNCTION public.nzos_sync_page(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nzos_sync_page(bigint) TO service_role;
