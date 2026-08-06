-- Backfill profit data for existing order_items
-- This migration calculates and updates profit for all existing order items

UPDATE public.order_items oi
SET 
  cost_price = COALESCE(
    NULLIF(p.cost_price, 0),
    NULLIF(p.average_cost, 0),
    0
  ),
  profit = (oi.price - COALESCE(
    NULLIF(p.cost_price, 0),
    NULLIF(p.average_cost, 0),
    0
  )) * oi.quantity,
  profit_margin = CASE 
    WHEN oi.price > 0 THEN
      ROUND(((oi.price - COALESCE(
        NULLIF(p.cost_price, 0),
        NULLIF(p.average_cost, 0),
        0
      )) / oi.price) * 100, 2)
    ELSE 0
  END
FROM public.products p
WHERE oi.product_slug = p.slug
  AND (oi.cost_price IS NULL OR oi.profit IS NULL OR oi.profit_margin IS NULL);

