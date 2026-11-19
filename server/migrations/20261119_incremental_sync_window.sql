-- Keep a bounded history. A restored Mac older than this window receives a fresh authorized baseline.
CREATE TABLE nzos_private.sync_floor(floor bigint NOT NULL);
INSERT INTO nzos_private.sync_floor VALUES(0);
ALTER TABLE nzos_private.sync_changes ADD COLUMN image_changed boolean NOT NULL DEFAULT true;
CREATE FUNCTION nzos_private.compact_sync_changes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.revision%1024=0 AND NEW.revision>16000 THEN
  DELETE FROM nzos_private.sync_changes WHERE revision<=NEW.revision-16000;
  UPDATE nzos_private.sync_floor SET floor=NEW.revision-16000;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER compact_sync_changes AFTER INSERT ON nzos_private.sync_changes FOR EACH ROW EXECUTE FUNCTION nzos_private.compact_sync_changes();
CREATE OR REPLACE FUNCTION nzos_private.record_sync_key() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE row_key text; previous_key text; image_changed boolean:=true;
BEGIN
 PERFORM pg_advisory_xact_lock(39178320360291);
 IF TG_OP<>'INSERT' THEN EXECUTE format('SELECT ($1).%I::text',TG_ARGV[0]) INTO previous_key USING OLD; END IF;
 IF TG_OP<>'DELETE' THEN EXECUTE format('SELECT ($1).%I::text',TG_ARGV[0]) INTO row_key USING NEW; END IF;
 IF TG_TABLE_NAME='orders' AND TG_OP='UPDATE' AND previous_key=row_key THEN image_changed:=NEW.style_image_base64 IS DISTINCT FROM OLD.style_image_base64; END IF;
 IF previous_key IS NOT NULL AND previous_key IS DISTINCT FROM row_key THEN INSERT INTO nzos_private.sync_changes(relation,record_key) VALUES(TG_TABLE_NAME,previous_key); END IF;
 IF row_key IS NOT NULL THEN INSERT INTO nzos_private.sync_changes(relation,record_key,image_changed) VALUES(TG_TABLE_NAME,row_key,image_changed); END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.nzos_sync_page(after_revision bigint) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH watermark AS (SELECT coalesce(max(revision),0) tip FROM nzos_private.sync_changes),
 changes AS (SELECT * FROM nzos_private.sync_changes WHERE revision>after_revision ORDER BY revision LIMIT 300),
 cut AS (SELECT coalesce(max(revision),(SELECT tip FROM watermark)) last FROM changes)
 SELECT jsonb_build_object('revision',CASE WHEN after_revision IS NULL OR after_revision<floor THEN tip ELSE last END,
 'reset',after_revision>tip OR after_revision<floor,'more',last<tip,
 'changes',coalesce((SELECT jsonb_agg(jsonb_build_array(relation,record_key,image_changed) ORDER BY revision) FROM changes),'[]'))
 FROM watermark,cut,nzos_private.sync_floor
$$;
CREATE FUNCTION public.nzos_order_delta(ids uuid[], images uuid[]) RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN o.id=ANY(images) THEN to_jsonb(o) ELSE to_jsonb(o)-'style_image_base64' END FROM public.orders o WHERE o.id=ANY(ids)
$$;
REVOKE ALL ON FUNCTION public.nzos_order_delta(uuid[],uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nzos_order_delta(uuid[],uuid[]) TO service_role;
