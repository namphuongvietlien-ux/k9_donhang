-- =====================================================
-- CHECK CANCELLED ECOMMERCE ORDERS WITHOUT STOCK RETURN
-- Kiểm tra các đơn hàng TMĐT đã cancelled nhưng chưa được trả hàng về kho
-- =====================================================

-- 1. View: Danh sách ecommerce_orders đã cancelled nhưng chưa có stock_in (return)
CREATE OR REPLACE VIEW v_cancelled_ecommerce_orders_without_stock_return AS
SELECT 
  eo.id,
  eo.tracking_code,
  eo.platform_code,
  ep.name as platform_name,
  eo.status,
  eo.created_at,
  eo.updated_at,
  -- Stock out info
  sot.id as stock_out_id,
  sot.transaction_date as stock_out_date,
  sot.code as stock_out_code,
  COUNT(DISTINCT soi.id) as stock_out_items_count,
  SUM(soi.quantity) as total_quantity_out,
  SUM(soi.total_cost) as total_cost_out,
  -- Stock in info (should exist but doesn't)
  sit.id as stock_in_id,
  sit.code as stock_in_code,
  -- Accounts receivable info
  ar.id as accounts_receivable_id,
  ar.status as ar_status,
  ar.remaining_amount as ar_remaining
FROM public.ecommerce_orders eo
LEFT JOIN public.ecommerce_platforms ep ON ep.code = eo.platform_code
LEFT JOIN public.stock_out_transactions sot ON sot.ecommerce_order_id = eo.id AND sot.type = 'sale'
LEFT JOIN public.stock_out_items soi ON soi.stock_out_id = sot.id
LEFT JOIN public.stock_in_transactions sit ON sit.reference_number = 'Hủy đơn hàng TMĐT ' || eo.tracking_code AND sit.type = 'return'
LEFT JOIN public.accounts_receivable ar ON ar.id = eo.accounts_receivable_id
WHERE eo.status = 'cancelled'
  AND sot.id IS NOT NULL -- Có stock_out (đã xuất kho)
  AND sit.id IS NULL -- Chưa có stock_in (chưa trả hàng)
GROUP BY 
  eo.id,
  eo.tracking_code,
  eo.platform_code,
  ep.name,
  eo.status,
  eo.created_at,
  eo.updated_at,
  sot.id,
  sot.transaction_date,
  sot.code,
  sit.id,
  sit.code,
  ar.id,
  ar.status,
  ar.remaining_amount
ORDER BY eo.created_at DESC;

-- 2. Query: Tổng hợp thống kê
SELECT 
  COUNT(*) as total_cancelled_orders_without_return,
  COUNT(DISTINCT platform_code) as affected_platforms,
  SUM(total_quantity_out) as total_items_to_return,
  SUM(total_cost_out) as total_cost_to_return
FROM v_cancelled_ecommerce_orders_without_stock_return;

-- 3. Query: Chi tiết từng đơn hàng
SELECT 
  tracking_code,
  platform_name,
  stock_out_code,
  stock_out_date,
  stock_out_items_count,
  total_quantity_out,
  total_cost_out,
  ar_status,
  ar_remaining,
  created_at,
  updated_at
FROM v_cancelled_ecommerce_orders_without_stock_return
ORDER BY created_at DESC
LIMIT 50;

-- 4. Query: Chi tiết sản phẩm cần trả về kho
SELECT 
  eo.tracking_code,
  eo.platform_code,
  p.name as product_name,
  p.slug as product_slug,
  soi.quantity as quantity_to_return,
  soi.unit_cost,
  soi.total_cost,
  p.stock_quantity as current_stock
FROM public.ecommerce_orders eo
INNER JOIN public.stock_out_transactions sot ON sot.ecommerce_order_id = eo.id AND sot.type = 'sale'
INNER JOIN public.stock_out_items soi ON soi.stock_out_id = sot.id
INNER JOIN public.products p ON p.id = soi.product_id
LEFT JOIN public.stock_in_transactions sit ON sit.reference_number = 'Hủy đơn hàng TMĐT ' || eo.tracking_code AND sit.type = 'return'
WHERE eo.status = 'cancelled'
  AND sit.id IS NULL -- Chưa có stock_in
ORDER BY eo.created_at DESC, p.name;

-- Comments
COMMENT ON VIEW v_cancelled_ecommerce_orders_without_stock_return IS 'Danh sách các đơn hàng TMĐT đã cancelled nhưng chưa được trả hàng về kho';
