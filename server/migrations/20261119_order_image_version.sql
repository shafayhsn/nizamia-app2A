CREATE FUNCTION public.nzos_image_version(public.orders) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT md5(nullif($1.style_image_base64,''))
$$;
