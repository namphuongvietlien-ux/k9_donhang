SELECT oi.product_id, oi.product_slug, p.slug AS catalog_slug,
  g.main_product_id AS gift_main_id,
  (oi.product_id = g.main_product_id) AS id_match,
  o.stock_posted_at
FROM public.orders o
JOIN public.order_items oi ON oi.order_id = o.id
LEFT JOIN public.products p ON p.id = oi.product_id
LEFT JOIN public.product_gifts g ON g.main_product_id = 'a31f746e-9704-4bbd-91da-da007b4e4bbf'
WHERE o.order_code = 'DH-511516';
