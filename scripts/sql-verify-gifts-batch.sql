SELECT 'fn' AS kind, p.proname AS name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'finalize_warehouse_order',
    'complete_internal_dispatches',
    'expand_order_gifts',
    'deduct_order_stock',
    'expand_dispatch_gifts',
    'normalize_stock_unit_key'
  )
UNION ALL
SELECT 'col', c.table_name || '.' || c.column_name
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND (
    (c.table_name = 'orders' AND c.column_name = 'stock_posted_at')
    OR (c.table_name = 'order_items' AND c.column_name IN ('is_gift', 'gift_of_item_id'))
    OR (c.table_name = 'internal_dispatch_items' AND c.column_name = 'is_gift')
    OR (c.table_name = 'product_gifts' AND c.column_name = 'id')
  )
UNION ALL
SELECT 'trg', t.tgname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal AND t.tgname ILIKE '%gift%'
ORDER BY 1, 2;
