SELECT g.id, g.quantity, g.is_active,
  pm.slug AS main_slug, pg.slug AS gift_slug,
  g.main_product_id, g.gift_product_id
FROM public.product_gifts g
LEFT JOIN public.products pm ON pm.id = g.main_product_id
LEFT JOIN public.products pg ON pg.id = g.gift_product_id
ORDER BY g.created_at DESC
LIMIT 20;
