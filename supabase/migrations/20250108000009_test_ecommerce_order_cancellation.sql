-- =====================================================
-- TEST ECOMMERCE ORDER CANCELLATION LOGIC
-- Script test để kiểm tra logic tự động trả hàng về kho khi cancelled
-- =====================================================

-- ⚠️ TEST SCRIPT - Chỉ dùng để test, không chạy trên production data

-- 1. Tìm một ecommerce_order đã có stock_out nhưng chưa cancelled
--    (Để test logic cancellation)
SELECT 
  eo.id,
  eo.tracking_code,
  eo.platform_code,
  eo.status,
  sot.id as stock_out_id,
  sot.code as stock_out_code,
  COUNT(soi.id) as items_count,
  SUM(soi.quantity) as total_quantity,
  SUM(soi.total_cost) as total_cost
FROM public.ecommerce_orders eo
INNER JOIN public.stock_out_transactions sot ON sot.ecommerce_order_id = eo.id AND sot.type = 'sale'
INNER JOIN public.stock_out_items soi ON soi.stock_out_id = sot.id
LEFT JOIN public.stock_in_transactions sit ON sit.reference_number = 'Hủy đơn hàng TMĐT ' || eo.tracking_code AND sit.type = 'return'
WHERE eo.status != 'cancelled'
  AND sit.id IS NULL -- Chưa có stock_in (chưa bị cancelled)
GROUP BY eo.id, eo.tracking_code, eo.platform_code, eo.status, sot.id, sot.code
ORDER BY eo.created_at DESC
LIMIT 5;

-- 2. Test: Kiểm tra stock trước khi cancelled
--    (Thay [ECOMMERCE_ORDER_ID] bằng ID thực tế)
/*
SELECT 
  p.name as product_name,
  p.stock_quantity as stock_before,
  soi.quantity as quantity_in_order,
  soi.unit_cost,
  soi.total_cost
FROM public.ecommerce_orders eo
INNER JOIN public.stock_out_transactions sot ON sot.ecommerce_order_id = eo.id
INNER JOIN public.stock_out_items soi ON soi.stock_out_id = sot.id
INNER JOIN public.products p ON p.id = soi.product_id
WHERE eo.id = '[ECOMMERCE_ORDER_ID]';
*/

-- 3. Test: Simulate cancellation (chỉ để xem, không update thật)
--    (Thay [ECOMMERCE_ORDER_ID] bằng ID thực tế)
/*
-- Step 1: Check current status
SELECT id, tracking_code, status FROM public.ecommerce_orders WHERE id = '[ECOMMERCE_ORDER_ID]';

-- Step 2: Update status to cancelled (trigger will fire automatically)
UPDATE public.ecommerce_orders 
SET status = 'cancelled' 
WHERE id = '[ECOMMERCE_ORDER_ID]'
RETURNING id, tracking_code, status;

-- Step 3: Check if stock_in was created
SELECT 
  sit.id,
  sit.code,
  sit.type,
  sit.reference_number,
  sit.transaction_date,
  COUNT(sii.id) as items_count,
  SUM(sii.quantity) as total_quantity,
  SUM(sii.total_price) as total_value
FROM public.stock_in_transactions sit
INNER JOIN public.stock_in_items sii ON sii.stock_in_id = sit.id
WHERE sit.reference_number = 'Hủy đơn hàng TMĐT ' || (SELECT tracking_code FROM public.ecommerce_orders WHERE id = '[ECOMMERCE_ORDER_ID]')
  AND sit.type = 'return'
GROUP BY sit.id, sit.code, sit.type, sit.reference_number, sit.transaction_date;

-- Step 4: Check stock after return
SELECT 
  p.name as product_name,
  p.stock_quantity as stock_after,
  soi.quantity as quantity_returned
FROM public.ecommerce_orders eo
INNER JOIN public.stock_out_transactions sot ON sot.ecommerce_order_id = eo.id
INNER JOIN public.stock_out_items soi ON soi.stock_out_id = sot.id
INNER JOIN public.products p ON p.id = soi.product_id
WHERE eo.id = '[ECOMMERCE_ORDER_ID]';

-- Step 5: Check accounts_receivable
SELECT 
  ar.id,
  ar.status,
  ar.original_amount,
  ar.paid_amount,
  ar.remaining_amount,
  ar.notes
FROM public.ecommerce_orders eo
LEFT JOIN public.accounts_receivable ar ON ar.id = eo.accounts_receivable_id
WHERE eo.id = '[ECOMMERCE_ORDER_ID]';
*/

-- 4. Test: Rollback cancellation (nếu cần)
--    (Thay [ECOMMERCE_ORDER_ID] bằng ID thực tế)
/*
-- ⚠️ WARNING: Rollback sẽ xóa stock_in_transaction và trừ lại stock
-- Chỉ dùng khi test, không dùng trên production

-- Step 1: Find stock_in created
SELECT id, code FROM public.stock_in_transactions 
WHERE reference_number = 'Hủy đơn hàng TMĐT ' || (SELECT tracking_code FROM public.ecommerce_orders WHERE id = '[ECOMMERCE_ORDER_ID]')
  AND type = 'return';

-- Step 2: Delete stock_in_items (will trigger stock decrease)
DELETE FROM public.stock_in_items 
WHERE stock_in_id IN (
  SELECT id FROM public.stock_in_transactions 
  WHERE reference_number = 'Hủy đơn hàng TMĐT ' || (SELECT tracking_code FROM public.ecommerce_orders WHERE id = '[ECOMMERCE_ORDER_ID]')
    AND type = 'return'
);

-- Step 3: Delete stock_in_transaction
DELETE FROM public.stock_in_transactions 
WHERE reference_number = 'Hủy đơn hàng TMĐT ' || (SELECT tracking_code FROM public.ecommerce_orders WHERE id = '[ECOMMERCE_ORDER_ID]')
  AND type = 'return';

-- Step 4: Rollback accounts_receivable
UPDATE public.accounts_receivable
SET 
  remaining_amount = original_amount,
  paid_amount = 0,
  status = 'pending',
  notes = REPLACE(COALESCE(notes, ''), ' - Đơn hàng TMĐT đã hủy (' || (SELECT tracking_code FROM public.ecommerce_orders WHERE id = '[ECOMMERCE_ORDER_ID]') || ')', '')
WHERE id = (SELECT accounts_receivable_id FROM public.ecommerce_orders WHERE id = '[ECOMMERCE_ORDER_ID]');

-- Step 5: Rollback order status
UPDATE public.ecommerce_orders 
SET status = 'pending' 
WHERE id = '[ECOMMERCE_ORDER_ID]';
*/

-- 5. Summary query: Check all test scenarios
SELECT 
  'Total ecommerce orders' as metric,
  COUNT(*)::TEXT as value
FROM public.ecommerce_orders
UNION ALL
SELECT 
  'Cancelled orders',
  COUNT(*)::TEXT
FROM public.ecommerce_orders
WHERE status = 'cancelled'
UNION ALL
SELECT 
  'Cancelled with stock_out',
  COUNT(DISTINCT eo.id)::TEXT
FROM public.ecommerce_orders eo
INNER JOIN public.stock_out_transactions sot ON sot.ecommerce_order_id = eo.id AND sot.type = 'sale'
WHERE eo.status = 'cancelled'
UNION ALL
SELECT 
  'Cancelled with stock_return',
  COUNT(DISTINCT eo.id)::TEXT
FROM public.ecommerce_orders eo
INNER JOIN public.stock_in_transactions sit ON sit.reference_number = 'Hủy đơn hàng TMĐT ' || eo.tracking_code AND sit.type = 'return'
WHERE eo.status = 'cancelled'
UNION ALL
SELECT 
  'Cancelled WITHOUT stock_return (needs backfill)',
  COUNT(DISTINCT eo.id)::TEXT
FROM public.ecommerce_orders eo
INNER JOIN public.stock_out_transactions sot ON sot.ecommerce_order_id = eo.id AND sot.type = 'sale'
LEFT JOIN public.stock_in_transactions sit ON sit.reference_number = 'Hủy đơn hàng TMĐT ' || eo.tracking_code AND sit.type = 'return'
WHERE eo.status = 'cancelled'
  AND sit.id IS NULL;
