-- =====================================================
-- CHECK STOCK OUT SALES CHANNEL (DRY RUN)
-- Kiểm tra số lượng stock out cần cập nhật sales_channel
-- Chạy script này TRƯỚC khi chạy backfill để xem preview
-- =====================================================

-- 1. Count stock out có order_id và link với ecommerce_order
SELECT 
  'Có ecommerce_order' as category,
  COUNT(*) as count,
  STRING_AGG(DISTINCT eo.platform_code, ', ') as platforms
FROM public.stock_out_transactions sot
INNER JOIN public.orders o ON sot.order_id = o.id
INNER JOIN public.ecommerce_orders eo ON eo.internal_order_id = o.id
WHERE sot.sales_channel IS NULL
  AND sot.type = 'sale';

-- 2. Count stock out có order_id nhưng không link với ecommerce_order
SELECT 
  'Có order_id (website)' as category,
  COUNT(*) as count,
  NULL as platforms
FROM public.stock_out_transactions sot
WHERE sot.order_id IS NOT NULL
  AND sot.sales_channel IS NULL
  AND sot.type = 'sale'
  AND NOT EXISTS (
    SELECT 1 
    FROM public.orders o
    INNER JOIN public.ecommerce_orders eo ON eo.internal_order_id = o.id
    WHERE sot.order_id = o.id
  );

-- 3. Count stock out không có order_id (xuất thủ công)
SELECT 
  'Không có order_id (xuất thủ công)' as category,
  COUNT(*) as count,
  NULL as platforms
FROM public.stock_out_transactions sot
WHERE sot.order_id IS NULL
  AND sot.sales_channel IS NULL
  AND sot.type = 'sale';

-- 4. Summary: Tổng số stock out chưa có sales_channel
SELECT 
  'TỔNG CỘNG' as category,
  COUNT(*) as count,
  NULL as platforms
FROM public.stock_out_transactions sot
WHERE sot.sales_channel IS NULL
  AND sot.type = 'sale';

-- 5. Preview: Xem một số records sẽ được update
SELECT 
  sot.id,
  sot.code,
  sot.transaction_date,
  sot.type,
  sot.order_id,
  o.order_code,
  eo.platform_code as will_set_sales_channel,
  CASE 
    WHEN eo.platform_code IS NOT NULL THEN eo.platform_code
    WHEN sot.order_id IS NOT NULL THEN 'website'
    ELSE 'NULL (giữ nguyên)'
  END as sales_channel_preview
FROM public.stock_out_transactions sot
LEFT JOIN public.orders o ON sot.order_id = o.id
LEFT JOIN public.ecommerce_orders eo ON eo.internal_order_id = o.id
WHERE sot.sales_channel IS NULL
  AND sot.type = 'sale'
ORDER BY sot.transaction_date DESC
LIMIT 20;
