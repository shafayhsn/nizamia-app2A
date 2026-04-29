-- F3 Users & Rights extended migration
-- Safe to run multiple times.

ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';

ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

ALTER TABLE public.buyers
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

ALTER TABLE public.library_items
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

ALTER TABLE public.size_group_templates
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON public.suppliers(is_active);
CREATE INDEX IF NOT EXISTS idx_buyers_is_active ON public.buyers(is_active);
CREATE INDEX IF NOT EXISTS idx_library_items_is_active ON public.library_items(is_active);
CREATE INDEX IF NOT EXISTS idx_size_group_templates_is_active ON public.size_group_templates(is_active);

-- App-2A login gate username support
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique
ON public.users (lower(username))
WHERE username IS NOT NULL AND username <> '';
