-- Apply after verified server routes are deployed and old client versions are retired.
REVOKE ALL ON TABLE public.purchase_orders, public.purchase_order_items, public.purchase_order_changelog FROM PUBLIC, anon, authenticated;
