-- =====================================================
-- CREATE STOCK OUT TRANSACTION FOR ECOMMERCE ORDERS
-- Tự động tạo stock_out_transaction khi thêm mã vận đơn (tạo ecommerce_order)
-- Thay thế logic trừ stock trực tiếp bằng tạo stock_out_transaction đầy đủ
-- =====================================================

-- 1. Function: Tạo stock_out_transaction từ ecommerce_order
CREATE OR REPLACE FUNCTION create_stock_out_from_ecommerce_order(
  p_ecommerce_order_id UUID
) RETURNS UUID AS $$
DECLARE
  v_item RECORD;
  v_order RECORD;
  v_stock_out_id UUID;
  v_stock_out_item_id UUID;
  v_trans_date DATE;
  v_platform_code VARCHAR(50);
  v_platform_name VARCHAR(100);
BEGIN
  -- Get ecommerce order info
  SELECT 
    eo.*,
    ep.code as platform_code,
    ep.name as platform_name
  INTO v_order
  FROM public.ecommerce_orders eo
  LEFT JOIN public.ecommerce_platforms ep ON ep.code = eo.platform_code
  WHERE eo.id = p_ecommerce_order_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ecommerce order not found: %', p_ecommerce_order_id;
  END IF;
  
  v_platform_code := v_order.platform_code;
  v_platform_name := COALESCE(v_order.platform_name, v_platform_code);
  v_trans_date := CURRENT_DATE; -- Use current date when creating order
  
  -- Check if stock_out_transaction already exists for this ecommerce_order
  SELECT id INTO v_stock_out_id
  FROM public.stock_out_transactions
  WHERE ecommerce_order_id = p_ecommerce_order_id
  LIMIT 1;
  
  -- If already exists, return existing ID
  IF v_stock_out_id IS NOT NULL THEN
    RETURN v_stock_out_id;
  END IF;
  
  -- Create stock_out_transaction
  INSERT INTO public.stock_out_transactions (
    transaction_date,
    type,
    sales_channel,
    ecommerce_order_id,
    reference_number,
    notes
  ) VALUES (
    v_trans_date,
    'sale',
    v_platform_code,
    p_ecommerce_order_id,
    v_order.tracking_code,
    'Tự động xuất kho từ đơn hàng TMĐT ' || v_order.tracking_code || 
    ' (' || v_platform_name || ')'
  )
  RETURNING id INTO v_stock_out_id;
  
  -- Process each ecommerce_order_item
  FOR v_item IN 
    SELECT 
      eoi.id,
      eoi.internal_product_id,
      eoi.quantity,
      eoi.unit_price
    FROM public.ecommerce_order_items eoi
    WHERE eoi.ecommerce_order_id = p_ecommerce_order_id
  LOOP
    -- Create stock_out_item (cost will be calculated by trigger using FIFO)
    INSERT INTO public.stock_out_items (
      stock_out_id,
      product_id,
      quantity,
      unit_cost,
      total_cost
    ) VALUES (
      v_stock_out_id,
      v_item.internal_product_id,
      v_item.quantity,
      0, -- Will be calculated by trigger
      0  -- Will be calculated by trigger
    )
    RETURNING id INTO v_stock_out_item_id;
    
    -- Note: Trigger update_stock_on_out() will automatically:
    -- 1. Calculate cost using FIFO (stock_out_fifo function)
    -- 2. Update inventory_lots
    -- 3. Create inventory_movements
    -- 4. Update products.stock_quantity
  END LOOP;
  
  RETURN v_stock_out_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger: Tự động tạo stock_out_transaction khi ecommerce_order_items được insert
-- (Khi admin thêm sản phẩm vào ecommerce_order)
CREATE OR REPLACE FUNCTION trigger_create_stock_out_on_ecommerce_order_items()
RETURNS TRIGGER AS $$
DECLARE
  v_stock_out_id UUID;
  v_ecommerce_order_id UUID;
  v_has_items BOOLEAN;
BEGIN
  -- Get ecommerce_order_id
  v_ecommerce_order_id := COALESCE(NEW.ecommerce_order_id, OLD.ecommerce_order_id);
  
  IF v_ecommerce_order_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Check if ecommerce_order has any items
  SELECT EXISTS (
    SELECT 1 
    FROM public.ecommerce_order_items 
    WHERE ecommerce_order_id = v_ecommerce_order_id
  ) INTO v_has_items;
  
  -- Only create stock_out if order has items and doesn't have stock_out yet
  IF v_has_items THEN
    -- Check if stock_out already exists
    SELECT id INTO v_stock_out_id
    FROM public.stock_out_transactions
    WHERE ecommerce_order_id = v_ecommerce_order_id
    LIMIT 1;
    
    -- If not exists, create it
    IF v_stock_out_id IS NULL THEN
      PERFORM create_stock_out_from_ecommerce_order(v_ecommerce_order_id);
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_create_stock_out_on_ecommerce_order_items_insert ON public.ecommerce_order_items;
DROP TRIGGER IF EXISTS trigger_create_stock_out_on_ecommerce_order_items_update ON public.ecommerce_order_items;

-- Create trigger on INSERT (when items are added)
CREATE TRIGGER trigger_create_stock_out_on_ecommerce_order_items_insert
AFTER INSERT ON public.ecommerce_order_items
FOR EACH ROW
EXECUTE FUNCTION trigger_create_stock_out_on_ecommerce_order_items();

-- Create trigger on UPDATE (in case items are modified)
CREATE TRIGGER trigger_create_stock_out_on_ecommerce_order_items_update
AFTER UPDATE ON public.ecommerce_order_items
FOR EACH ROW
EXECUTE FUNCTION trigger_create_stock_out_on_ecommerce_order_items();

-- 3. Replace function: Tạo stock_out_transaction thay vì trừ stock trực tiếp khi delivered
-- (Giữ lại để tương thích với logic cũ, nhưng sẽ check xem đã có stock_out chưa)
CREATE OR REPLACE FUNCTION deduct_stock_on_ecommerce_delivery(
  p_ecommerce_order_id UUID
) RETURNS VOID AS $$
DECLARE
  v_stock_out_id UUID;
BEGIN
  -- Check if stock_out_transaction already exists
  SELECT id INTO v_stock_out_id
  FROM public.stock_out_transactions
  WHERE ecommerce_order_id = p_ecommerce_order_id
  LIMIT 1;
  
  -- If not exists, create it (fallback for old orders)
  IF v_stock_out_id IS NULL THEN
    v_stock_out_id := create_stock_out_from_ecommerce_order(p_ecommerce_order_id);
  END IF;
  
  -- Note: Stock đã được trừ khi tạo stock_out_items (trigger tự động xử lý)
  -- Không cần trừ stock trực tiếp nữa
END;
$$ LANGUAGE plpgsql;

-- 4. Function: Trả hàng về kho khi ecommerce_order bị cancelled
CREATE OR REPLACE FUNCTION return_stock_on_ecommerce_order_cancelled(
  p_ecommerce_order_id UUID
) RETURNS UUID AS $$
DECLARE
  v_order RECORD;
  v_stock_out_id UUID;
  v_stock_in_id UUID;
  v_stock_in_item_id UUID;
  v_stock_out_item RECORD;
  v_platform_name VARCHAR(100);
BEGIN
  -- Get ecommerce order info
  SELECT 
    eo.*,
    ep.name as platform_name
  INTO v_order
  FROM public.ecommerce_orders eo
  LEFT JOIN public.ecommerce_platforms ep ON ep.code = eo.platform_code
  WHERE eo.id = p_ecommerce_order_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ecommerce order not found: %', p_ecommerce_order_id;
  END IF;
  
  v_platform_name := COALESCE(v_order.platform_name, v_order.platform_code);
  
  -- Find the stock_out_transaction for this ecommerce_order
  SELECT id INTO v_stock_out_id
  FROM public.stock_out_transactions
  WHERE ecommerce_order_id = p_ecommerce_order_id
    AND type = 'sale'
  LIMIT 1;
  
  -- If no stock_out found, nothing to return
  IF v_stock_out_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Check if stock_in already exists for this cancellation (avoid duplicate)
  SELECT id INTO v_stock_in_id
  FROM public.stock_in_transactions
  WHERE reference_number = 'Hủy đơn hàng TMĐT ' || v_order.tracking_code
    AND type = 'return'
  LIMIT 1;
  
  IF v_stock_in_id IS NOT NULL THEN
    -- Already processed, return existing ID
    RETURN v_stock_in_id;
  END IF;
  
  -- Create stock_in_transaction (return type)
  -- Code will be auto-generated by trigger auto_generate_stock_in_code()
  INSERT INTO public.stock_in_transactions (
    code, -- NULL để trigger tự động generate
    transaction_date,
    type,
    reference_number,
    notes
  ) VALUES (
    NULL, -- Trigger sẽ tự động generate code
    CURRENT_DATE,
    'return',
    'Hủy đơn hàng TMĐT ' || v_order.tracking_code,
    'Trả hàng do hủy đơn hàng TMĐT ' || v_order.tracking_code || 
    ' (' || v_platform_name || ')'
  )
  RETURNING id INTO v_stock_in_id;
  
  -- Return each item to stock
  FOR v_stock_out_item IN
    SELECT 
      soi.product_id,
      soi.quantity,
      soi.unit_cost
    FROM public.stock_out_items soi
    WHERE soi.stock_out_id = v_stock_out_id
  LOOP
    -- Create stock_in_item (will create inventory_lot and update stock via trigger)
    INSERT INTO public.stock_in_items (
      stock_in_id,
      product_id,
      quantity,
      unit_price,
      total_price,
      notes
    ) VALUES (
      v_stock_in_id,
      v_stock_out_item.product_id,
      v_stock_out_item.quantity,
      v_stock_out_item.unit_cost, -- Use the original cost from stock_out
      v_stock_out_item.quantity * v_stock_out_item.unit_cost,
      'Trả hàng từ đơn hàng TMĐT ' || v_order.tracking_code
    )
    RETURNING id INTO v_stock_in_item_id;
    
    -- Note: Trigger on stock_in_items will automatically:
    -- 1. Create inventory_lot
    -- 2. Update products.stock_quantity
    -- 3. Create inventory_movements
  END LOOP;
  
  -- Update accounts_receivable if exists (mark as paid since order is cancelled)
  -- Set remaining_amount = 0 and paid_amount = original_amount so trigger will set status = 'paid'
  UPDATE public.accounts_receivable
  SET 
    remaining_amount = 0,
    paid_amount = original_amount,
    notes = COALESCE(notes, '') || ' - Đơn hàng TMĐT đã hủy (' || v_order.tracking_code || ')',
    updated_at = now()
  WHERE id = v_order.accounts_receivable_id
    AND remaining_amount > 0; -- Only update if not already paid
  
  RETURN v_stock_in_id;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger: Tự động trả hàng về kho khi ecommerce_order bị cancelled
CREATE OR REPLACE FUNCTION trigger_return_stock_on_ecommerce_order_cancelled()
RETURNS TRIGGER AS $$
DECLARE
  v_stock_in_id UUID;
BEGIN
  -- Only process when status changes to 'cancelled'
  IF NEW.status = 'cancelled' 
     AND (OLD.status IS NULL OR OLD.status != 'cancelled') THEN
    
    -- Return stock to inventory
    v_stock_in_id := return_stock_on_ecommerce_order_cancelled(NEW.id);
    
    -- Log if stock was returned
    IF v_stock_in_id IS NOT NULL THEN
      RAISE NOTICE 'Stock returned to inventory for cancelled ecommerce order %: stock_in_id = %', NEW.id, v_stock_in_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_return_stock_on_ecommerce_order_cancelled ON public.ecommerce_orders;

-- Create trigger on ecommerce_orders table
CREATE TRIGGER trigger_return_stock_on_ecommerce_order_cancelled
AFTER UPDATE ON public.ecommerce_orders
FOR EACH ROW
WHEN (NEW.status = 'cancelled' AND (OLD.status IS NULL OR OLD.status != 'cancelled'))
EXECUTE FUNCTION trigger_return_stock_on_ecommerce_order_cancelled();

-- 6. Update comments
COMMENT ON FUNCTION create_stock_out_from_ecommerce_order IS 'Tạo stock_out_transaction và trừ stock theo FIFO từ ecommerce_order. Được gọi khi thêm mã vận đơn hoặc khi delivered.';
COMMENT ON FUNCTION trigger_create_stock_out_on_ecommerce_order_items IS 'Trigger function: Tự động tạo stock_out_transaction khi ecommerce_order_items được insert/update.';
COMMENT ON FUNCTION deduct_stock_on_ecommerce_delivery IS 'Tạo stock_out_transaction khi đơn hàng TMĐT được giao thành công (fallback cho logic cũ).';
COMMENT ON FUNCTION return_stock_on_ecommerce_order_cancelled IS 'Trả hàng về kho khi đơn hàng TMĐT bị hủy. Tạo stock_in_transaction với type=return và trả lại số lượng đã xuất.';
COMMENT ON FUNCTION trigger_return_stock_on_ecommerce_order_cancelled IS 'Trigger function: Tự động trả hàng về kho khi ecommerce_order status thay đổi sang cancelled.';

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
