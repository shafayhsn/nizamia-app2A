-- Only the same-origin authenticated backend may read the journal. Browsers read changed rows through their usual RLS policies.
CREATE FUNCTION public.nzos_sampling_keys(after_revision bigint) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 WITH p AS (SELECT public.nzos_sync_page(after_revision) v)
 SELECT jsonb_build_object('revision',v->'revision','more',v->'more','reset',coalesce((v->>'reset')::boolean,false)
 OR EXISTS(SELECT FROM jsonb_array_elements(v->'changes') c WHERE c->>0 IN ('roles','permissions','users')),
 'changes',coalesce((SELECT jsonb_agg(jsonb_build_array(c->0,c->1)) FROM jsonb_array_elements(v->'changes') c
 WHERE c->>0 IN ('samples','orders','buyers','bom_items','fitting_blocks','sample_comments','parcels')),'[]'))
 FROM p
$$;
REVOKE ALL ON FUNCTION public.nzos_sampling_keys(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nzos_sampling_keys(bigint) TO service_role;

CREATE FUNCTION public.nzos_read_versions() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH member AS (
 SELECT u.id,u.role,u.role_id FROM nzos_private.edit_sessions e JOIN public.users u ON u.id=e.user_id
 WHERE e.proof_hash=sha256(convert_to(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-nzos-edit-proof','UTF8'))
 AND e.expires_at>now() AND u.is_active AND NOT coalesce(u.is_restricted,false) AND u.deleted_at IS NULL),
 mapping(area,tables) AS (VALUES('orders','orders order_queues bom_items fitting_blocks size_groups size_group_colors'),
 ('buyers','buyers'),('suppliers','suppliers'),('sampling','samples sample_comments'),('parcels','parcels'),('shipping','shipment_lines')),
 revisions AS (SELECT relation,max(revision) rev FROM nzos_private.sync_changes GROUP BY relation),
 permitted AS (SELECT m.id, t, greatest(floor,coalesce((SELECT max(rev) FROM revisions WHERE relation IN ('roles','permissions','users',t)),0)) stamp
 FROM member m CROSS JOIN mapping CROSS JOIN LATERAL unnest(string_to_array(tables,' ')) t CROSS JOIN nzos_private.sync_floor
 WHERE (m.role='admin' OR EXISTS(SELECT FROM public.permissions p WHERE p.role_id=m.role_id AND p.module=area AND p.can_view)))
 SELECT jsonb_object_agg(t,md5(id::text||':'||stamp::text)) FROM permitted
$$;
REVOKE ALL ON FUNCTION public.nzos_read_versions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nzos_read_versions() TO anon,authenticated;
