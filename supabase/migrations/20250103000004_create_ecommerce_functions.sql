-- Ecommerce Orders Tracking System
-- Phase 2: SQL Functions

-- Function: Trừ stock trực tiếp khi delivered (không tạo stock_out_transaction)
CREATE OR REPLACE FUNCTION deduct_stock_on_ecommerce_delivery(
  p_ecommerce_order_id UUID
) RETURNS VOID AS $$
DECLARE
  v_item RECORD;
BEGIN
  -- Trừ stock cho mỗi item
  FOR v_item IN 
    SELECT 
      eoi.internal_product_id,
      eoi.quantity,
      eoi.unit_price
    FROM public.ecommerce_order_items eoi
    WHERE eoi.ecommerce_order_id = p_ecommerce_order_id
  LOOP
    -- Trừ stock trực tiếp
    UPDATE public.products
    SET stock_quantity = stock_quantity - v_item.quantity,
        updated_at = NOW()
    WHERE id = v_item.internal_product_id;
    
    -- Log vào inventory_movements để tracking
    -- Note: lot_id và stock_out_item_id = NULL vì không có stock_out_transaction
    INSERT INTO public.inventory_movements (
      lot_id,
      stock_out_item_id,
      movement_type,
      quantity,
      unit_price,
      movement_date
    ) VALUES (
      NULL, -- Không có lot vì trừ trực tiếp
      NULL, -- Không có stock_out_item vì không tạo stock_out_transaction
      'out',
      v_item.quantity,
      v_item.unit_price,
      CURRENT_DATE
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function: Tạo công nợ với 15 ngày payment terms
CREATE OR REPLACE FUNCTION create_ar_on_ecommerce_delivery(
  p_ecommerce_order_id UUID,
  p_delivered_at TIMESTAMP WITH TIME ZONE
) RETURNS UUID AS $$
DECLARE
  v_ar_id UUID;
  v_order RECORD;
  v_total_amount DECIMAL(12, 0);
BEGIN
  -- Get order info
  SELECT * INTO v_order
  FROM public.ecommerce_orders
  WHERE id = p_ecommerce_order_id;
  
  -- Use total_amount từ ecommerce_order (đã tự động tính từ items)
  v_total_amount := v_order.total_amount;
  
  -- Generate AR ID
  v_ar_id := gen_random_uuid();
  
  -- Create accounts receivable với 15 ngày payment terms
  INSERT INTO public.accounts_receivable (
    id,
    order_id, -- NULL vì là ecommerce order
    customer_name, -- Required field
    customer_phone, -- Optional, lấy từ ecommerce_order nếu có
    original_amount,
    paid_amount,
    remaining_amount,
    due_date,
    status,
    notes
  ) VALUES (
    v_ar_id,
    NULL,
    'Khách hàng Shopee', -- Default name for ecommerce orders
    COALESCE(v_order.phone_last_4, NULL), -- Optional phone
    v_total_amount,
    0,
    v_total_amount, -- remaining_amount = original_amount - paid_amount
    DATE(p_delivered_at) + INTERVAL '15 days', -- ⭐ 15 NGÀY
    'pending',
    'Auto created from ecommerce order: ' || p_ecommerce_order_id::TEXT || ' (Tracking: ' || v_order.tracking_code || ')'
  );
  
  RETURN v_ar_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Check và xử lý khi delivered (milestone_code = 8)
CREATE OR REPLACE FUNCTION check_ecommerce_delivery()
RETURNS TRIGGER AS $$
DECLARE
  v_ar_id UUID;
BEGIN
  -- Nếu milestone mới là 8 (Delivered) và chưa được xử lý
  IF NEW.last_milestone_code = 8 
     AND (OLD.last_milestone_code IS NULL OR OLD.last_milestone_code != 8)
     AND NEW.accounts_receivable_id IS NULL THEN
    
    -- 1. Trừ stock trực tiếp
    PERFORM deduct_stock_on_ecommerce_delivery(NEW.id);
    
    -- 2. Tạo accounts receivable (15 ngày)
    v_ar_id := create_ar_on_ecommerce_delivery(NEW.id, NEW.delivered_at);
    
    -- 3. Update ecommerce_order
    UPDATE public.ecommerce_orders
    SET 
      accounts_receivable_id = v_ar_id,
      status = 'delivered'
    WHERE id = NEW.id;
    
    -- Update NEW để trigger tiếp tục
    NEW.accounts_receivable_id := v_ar_id;
    NEW.status := 'delivered';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto process khi delivered
-- Drop existing trigger if exists (idempotent)
DROP TRIGGER IF EXISTS trigger_ecommerce_delivery ON public.ecommerce_orders;

CREATE TRIGGER trigger_ecommerce_delivery
AFTER UPDATE ON public.ecommerce_orders
FOR EACH ROW
WHEN (NEW.last_milestone_code = 8 AND (OLD.last_milestone_code IS NULL OR OLD.last_milestone_code != 8))
EXECUTE FUNCTION check_ecommerce_delivery();

-- Comments
COMMENT ON FUNCTION deduct_stock_on_ecommerce_delivery IS 'Trừ stock trực tiếp khi đơn hàng TMĐT được giao thành công (không tạo stock_out_transaction)';
COMMENT ON FUNCTION create_ar_on_ecommerce_delivery IS 'Tạo công nợ với payment terms 15 ngày khi đơn hàng TMĐT được giao thành công';
COMMENT ON FUNCTION check_ecommerce_delivery IS 'Trigger function: Tự động xử lý khi milestone_code = 8 (Delivered)';

