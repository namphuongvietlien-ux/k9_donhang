-- =====================================================
-- BACKFILL STOCK RETURN FOR CANCELLED ECOMMERCE ORDERS
-- Tự động trả hàng về kho cho các đơn hàng TMĐT đã cancelled nhưng chưa được xử lý
-- =====================================================

-- ⚠️ WARNING: Script này sẽ tạo stock_in_transaction cho các đơn đã cancelled
-- Chỉ chạy sau khi đã kiểm tra bằng script check (20250108000007)

DO $$
DECLARE
  v_order RECORD;
  v_stock_in_id UUID;
  v_processed_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_total_count INTEGER := 0;
BEGIN
  -- Count total orders to process
  SELECT COUNT(*) INTO v_total_count
  FROM public.ecommerce_orders eo
  INNER JOIN public.stock_out_transactions sot ON sot.ecommerce_order_id = eo.id AND sot.type = 'sale'
  LEFT JOIN public.stock_in_transactions sit ON sit.reference_number = 'Hủy đơn hàng TMĐT ' || eo.tracking_code AND sit.type = 'return'
  WHERE eo.status = 'cancelled'
    AND sit.id IS NULL; -- Chưa có stock_in
  
  RAISE NOTICE 'Tổng số đơn hàng cần xử lý: %', v_total_count;
  
  -- Process each cancelled order
  FOR v_order IN
    SELECT DISTINCT
      eo.id,
      eo.tracking_code,
      eo.platform_code,
      eo.accounts_receivable_id,
      eo.created_at
    FROM public.ecommerce_orders eo
    INNER JOIN public.stock_out_transactions sot ON sot.ecommerce_order_id = eo.id AND sot.type = 'sale'
    LEFT JOIN public.stock_in_transactions sit ON sit.reference_number = 'Hủy đơn hàng TMĐT ' || eo.tracking_code AND sit.type = 'return'
    WHERE eo.status = 'cancelled'
      AND sit.id IS NULL -- Chưa có stock_in
    ORDER BY eo.created_at ASC
  LOOP
    BEGIN
      -- Use the existing function to return stock
      v_stock_in_id := return_stock_on_ecommerce_order_cancelled(v_order.id);
      
      IF v_stock_in_id IS NOT NULL THEN
        v_processed_count := v_processed_count + 1;
        RAISE NOTICE 'Đã xử lý: % (tracking: %) -> stock_in_id: %', v_order.id, v_order.tracking_code, v_stock_in_id;
      ELSE
        RAISE WARNING 'Không tìm thấy stock_out cho đơn hàng: % (tracking: %)', v_order.id, v_order.tracking_code;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      RAISE WARNING 'Lỗi khi xử lý đơn hàng % (tracking: %): %', v_order.id, v_order.tracking_code, SQLERRM;
    END;
  END LOOP;
  
  -- Summary
  RAISE NOTICE '========================================';
  RAISE NOTICE 'KẾT QUẢ XỬ LÝ:';
  RAISE NOTICE 'Tổng số đơn hàng: %', v_total_count;
  RAISE NOTICE 'Đã xử lý thành công: %', v_processed_count;
  RAISE NOTICE 'Lỗi: %', v_error_count;
  RAISE NOTICE '========================================';
END $$;

-- Verify results: Check if all cancelled orders now have stock_in
SELECT 
  COUNT(*) as remaining_orders_without_return,
  COUNT(DISTINCT platform_code) as affected_platforms
FROM v_cancelled_ecommerce_orders_without_stock_return;

-- Show summary of processed orders
SELECT 
  sit.code as stock_in_code,
  sit.transaction_date,
  sit.reference_number,
  COUNT(DISTINCT sit.id) as stock_in_count,
  SUM(sii.quantity) as total_items_returned,
  SUM(sii.total_price) as total_value_returned
FROM public.stock_in_transactions sit
INNER JOIN public.stock_in_items sii ON sii.stock_in_id = sit.id
WHERE sit.type = 'return'
  AND sit.reference_number LIKE 'Hủy đơn hàng TMĐT %'
  AND sit.created_at >= CURRENT_DATE -- Only today's processed orders
GROUP BY sit.id, sit.code, sit.transaction_date, sit.reference_number
ORDER BY sit.created_at DESC
LIMIT 20;
