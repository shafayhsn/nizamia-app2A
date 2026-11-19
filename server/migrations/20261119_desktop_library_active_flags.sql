-- The existing Library screens already save this flag when users deactivate an item.
ALTER TABLE public.library_items ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.size_group_templates ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
