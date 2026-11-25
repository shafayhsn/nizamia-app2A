CREATE OR REPLACE FUNCTION public.read_po_terms()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT value
  FROM public.app_settings
  WHERE key = 'nizamia_po_terms_conditions'
    AND (public.team_can_access('purchasing', 'view')
      OR public.team_can_access('purchasing', 'create')
      OR public.team_can_access('reports', 'view')
      OR public.team_can_access('settings', 'view'));
$$;

REVOKE ALL ON FUNCTION public.read_po_terms() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_po_terms() TO anon, authenticated;
