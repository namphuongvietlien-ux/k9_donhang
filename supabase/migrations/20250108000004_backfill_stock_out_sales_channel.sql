-- =====================================================
-- BACKFILL SALES CHANNEL FOR EXISTING STOCK OUT TRANSACTIONS
-- Cập nhật sales_channel cho các phiếu xuất kho cũ
-- =====================================================

-- Strategy:
-- 1. Nếu có order_id và order link với ecommerce_order → dùng platform_code
-- 2. Nếu có order_id nhưng không link với ecommerce_order → 'website'
-- 3. Nếu không có order_id (xuất thủ công) → NULL (giữ nguyên)

BEGIN;

-- 1. Update stock_out_transactions có order_id và link với ecommerce_order
UPDATE public.stock_out_transactions sot
SET 
  sales_channel = eo.platform_code,
  ecommerce_order_id = eo.id,
  updated_at = now()
FROM public.orders o
INNER JOIN public.ecommerce_orders eo ON eo.internal_order_id = o.id
WHERE sot.order_id = o.id
  AND sot.sales_channel IS NULL
  AND sot.type = 'sale';

-- 2. Update stock_out_transactions có order_id nhưng không link với ecommerce_order
-- → Mặc định là 'website'
UPDATE public.stock_out_transactions sot
SET 
  sales_channel = 'website',
  updated_at = now()
WHERE sot.order_id IS NOT NULL
  AND sot.sales_channel IS NULL
  AND sot.type = 'sale'
  AND NOT EXISTS (
    SELECT 1 
    FROM public.orders o
    INNER JOIN public.ecommerce_orders eo ON eo.internal_order_id = o.id
    WHERE sot.order_id = o.id
  );

-- 3. Log số lượng records đã cập nhật
DO $$
DECLARE
  v_updated_with_ecommerce INTEGER;
  v_updated_website INTEGER;
  v_total_updated INTEGER;
BEGIN
  -- Count records updated with ecommerce platform
  SELECT COUNT(*) INTO v_updated_with_ecommerce
  FROM public.stock_out_transactions
  WHERE sales_channel IN ('shopee', 'tiktok', 'ghn', 'jt')
    AND updated_at > now() - INTERVAL '1 minute';
  
  -- Count records updated as website
  SELECT COUNT(*) INTO v_updated_website
  FROM public.stock_out_transactions
  WHERE sales_channel = 'website'
    AND updated_at > now() - INTERVAL '1 minute';
  
  v_total_updated := v_updated_with_ecommerce + v_updated_website;
  
  RAISE NOTICE 'Backfill completed:';
  RAISE NOTICE '  - Updated with ecommerce platform: %', v_updated_with_ecommerce;
  RAISE NOTICE '  - Updated as website: %', v_updated_website;
  RAISE NOTICE '  - Total updated: %', v_total_updated;
END $$;

COMMIT;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
