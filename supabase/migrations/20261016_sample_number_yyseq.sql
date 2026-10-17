-- COORDINATED DEPLOYMENT ONLY. Deploy the matching frontend together with this migration.
-- Existing sample IDs and versions are preserved; this migration changes display references.
BEGIN;
LOCK TABLE public.samples IN ACCESS EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS public.sample_number_migration_20261016 (
  sample_id uuid PRIMARY KEY,
  old_number text NOT NULL,
  new_number text NOT NULL,
  migrated_at timestamptz NOT NULL DEFAULT now()
);
-- Abort if previously migrated; avoid accidental renumbering on a second run.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.sample_number_migration_20261016) THEN
  RAISE EXCEPTION 'Sample numbers already migrated; refusing to repeat';
 END IF;
END $$;
-- Group versions by root_sample_id; a revision retains its original family number.
WITH families AS (
 SELECT COALESCE(root_sample_id,id) AS family_id,
        MIN(created_at) AS first_created,
        MIN(id::text) AS tie_break,
        to_char(MIN(created_at),'YY') AS yy
 FROM public.samples
 GROUP BY COALESCE(root_sample_id,id)
), ranked AS (
 SELECT family_id,yy,ROW_NUMBER() OVER (PARTITION BY yy ORDER BY first_created,tie_break) AS seq
 FROM families
)
INSERT INTO public.sample_number_migration_20261016(sample_id,old_number,new_number)
SELECT s.id,s.sample_number,'SAM-'||r.yy||LPAD(r.seq::text,2,'0')
FROM public.samples s JOIN ranked r ON r.family_id=COALESCE(s.root_sample_id,s.id);
-- Update references in comments/logs, where applicable.
UPDATE public.sample_comments c SET sam_number=m.new_number
 FROM public.sample_number_migration_20261016 m WHERE c.sample_id=m.sample_id;
UPDATE public.sample_logs l SET sam_number=m.new_number
 FROM public.sample_number_migration_20261016 m WHERE l.sample_id=m.sample_id;
UPDATE public.samples s SET sample_number=m.new_number
 FROM public.sample_number_migration_20261016 m WHERE s.id=m.sample_id;
-- Keep the existing increment_counter RPC; initialize year-specific counters
-- to the highest allocated family number. Never lower an existing counter.
INSERT INTO public.counters(key,value)
 SELECT 'sam_'||substring(new_number from 5 for 2),MAX(substring(new_number from 7)::integer)
 FROM public.sample_number_migration_20261016 GROUP BY substring(new_number from 5 for 2)
ON CONFLICT(key) DO UPDATE SET value=GREATEST(public.counters.value,EXCLUDED.value);
COMMIT;
