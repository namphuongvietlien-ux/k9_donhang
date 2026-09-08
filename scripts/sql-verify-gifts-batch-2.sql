SELECT
  (SELECT count(*) FROM public.product_gifts) AS gift_rules,
  EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='restore_order_stock') AS restore_fn,
  EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='complete_internal_dispatches') AS batch_fn;
