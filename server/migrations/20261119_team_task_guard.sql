-- Only the assigned approval service changes its task. Ordinary task saves keep their own workflow.
DO $$ DECLARE command text; condition text := 'related_record IS NULL OR related_record NOT LIKE ''PO approval: %''';
BEGIN
 FOREACH command IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
   EXECUTE format('CREATE POLICY %I ON public.app_tasks AS RESTRICTIVE FOR %s TO anon,authenticated %s','protect_review_'||lower(command), command,
     CASE command WHEN 'INSERT' THEN 'WITH CHECK ('||condition||')' WHEN 'UPDATE' THEN 'USING ('||condition||') WITH CHECK ('||condition||')' ELSE 'USING ('||condition||')' END);
 END LOOP;
END $$;

DO $$ DECLARE definition text; anchor text:='IF allowed IS NULL'; additions text;
BEGIN
 SELECT pg_get_functiondef('public.desktop_save_catalog_record(uuid,uuid,text,text,uuid,jsonb,jsonb)'::regprocedure) INTO definition;
 IF strpos(definition,anchor)=0 OR strpos(definition,'desktop_private.team_permission')=0 THEN RAISE EXCEPTION 'Install role checked uploads first'; END IF;
 definition:=replace(definition,'CASE kind WHEN ''library_items'' THEN ''library''','CASE kind WHEN ''app_tasks'' THEN ''tasks'' WHEN ''app_task_comments'' THEN ''tasks'' WHEN ''library_items'' THEN ''library''');
 additions:=$guard$
 IF kind IN ('app_tasks','app_task_comments') THEN
   PERFORM 1 FROM public.app_tasks WHERE id=CASE WHEN kind='app_tasks' THEN target ELSE (patch->>'task_id')::uuid END FOR UPDATE;
   IF kind='app_tasks' AND (patch->>'related_record' LIKE 'PO approval: %' OR EXISTS(SELECT FROM public.po_approval_requests WHERE task_id=target)) THEN RETURN 'unauthorized'; END IF;
   IF (kind='app_task_comments' OR previous<>'null') AND NOT EXISTS(SELECT FROM public.users WHERE id=actor AND role='admin') AND NOT EXISTS(
     SELECT FROM public.app_tasks WHERE id=CASE WHEN kind='app_tasks' THEN target ELSE (patch->>'task_id')::uuid END AND actor IN (created_by,assignee_id)
   ) THEN RETURN 'unauthorized'; END IF;
 END IF;
 $guard$;
 EXECUTE replace(definition,anchor,additions||anchor);
END $$;
