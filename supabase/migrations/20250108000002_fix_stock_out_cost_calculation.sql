-- =====================================================
-- FIX: Stock Out Cost Calculation
-- Fix issue where total_cost = 0 when no inventory_lots exist
-- Use average_cost or last_purchase_price as fallback
-- =====================================================

-- Update stock_out_fifo function to handle case when no inventory_lots exist
CREATE OR REPLACE FUNCTION stock_out_fifo(
  p_product_id UUID,
  p_quantity INTEGER,
  p_stock_out_item_id UUID,
  p_movement_date DATE DEFAULT CURRENT_DATE
) RETURNS DECIMAL(12, 0) AS $$
DECLARE
  lot_record RECORD;
  remaining_qty INTEGER := p_quantity;
  total_cost DECIMAL(12, 0) := 0;
  lot_qty INTEGER;
  lot_cost DECIMAL(12, 0);
  lot_id_val UUID;
  new_quantity INTEGER;
  product_cost_price DECIMAL(12, 0);
  product_avg_cost DECIMAL(12, 0);
  product_last_purchase_price DECIMAL(12, 0);
  fallback_cost DECIMAL(12, 0);
  has_lots BOOLEAN := false;
BEGIN
  -- Lấy các lô theo thứ tự FIFO (lô cũ nhất trước)
  FOR lot_record IN
    SELECT id, quantity, unit_price
    FROM public.inventory_lots
    WHERE product_id = p_product_id
      AND quantity > 0
    ORDER BY received_date ASC, created_at ASC
  LOOP
    has_lots := true;
    -- Nếu đã lấy đủ số lượng, thoát
    EXIT WHEN remaining_qty <= 0;
    
    -- Số lượng lấy từ lô này
    lot_qty := LEAST(remaining_qty, lot_record.quantity);
    lot_cost := lot_record.unit_price;
    lot_id_val := lot_record.id;
    new_quantity := lot_record.quantity - lot_qty;
    
    -- Ghi nhận vào inventory_movements TRƯỚC khi xóa/cập nhật lô
    INSERT INTO public.inventory_movements (
      lot_id,
      stock_out_item_id,
      movement_type,
      quantity,
      unit_price,
      movement_date
    ) VALUES (
      lot_id_val,
      p_stock_out_item_id,
      'out',
      lot_qty,
      lot_cost,
      p_movement_date
    );
    
    -- Nếu số lượng còn lại = 0, xóa lô; nếu không, cập nhật
    IF new_quantity <= 0 THEN
      DELETE FROM public.inventory_lots
      WHERE id = lot_id_val;
    ELSE
      UPDATE public.inventory_lots
      SET quantity = new_quantity,
          updated_at = now()
      WHERE id = lot_id_val;
    END IF;
    
    -- Tính tổng giá vốn
    total_cost := total_cost + (lot_qty * lot_cost);
    remaining_qty := remaining_qty - lot_qty;
  END LOOP;
  
  -- Nếu không có inventory_lots hoặc còn thiếu số lượng, dùng fallback cost
  IF NOT has_lots OR remaining_qty > 0 THEN
    -- Lấy cost_price, average_cost hoặc last_purchase_price từ products table
    -- Priority: cost_price > average_cost > last_purchase_price
    SELECT 
      COALESCE(
        NULLIF(cost_price, 0),
        NULLIF(average_cost, 0),
        last_purchase_price,
        0
      )
    INTO fallback_cost
    FROM public.products
    WHERE id = p_product_id;
    
    -- Nếu có fallback cost và > 0, sử dụng nó cho phần còn lại
    IF fallback_cost > 0 THEN
      -- Nếu không có lots nào, tính toàn bộ bằng fallback
      IF NOT has_lots THEN
        total_cost := p_quantity * fallback_cost;
      ELSE
        -- Nếu có một phần từ lots, tính phần còn lại bằng fallback
        total_cost := total_cost + (remaining_qty * fallback_cost);
      END IF;
      
      -- Ghi nhận vào inventory_movements với lot_id = NULL (không có lô)
      INSERT INTO public.inventory_movements (
        lot_id,
        stock_out_item_id,
        movement_type,
        quantity,
        unit_price,
        movement_date
      ) VALUES (
        NULL, -- Không có lô
        p_stock_out_item_id,
        'out',
        COALESCE(remaining_qty, p_quantity),
        fallback_cost,
        p_movement_date
      );
    END IF;
  END IF;
  
  -- Cập nhật stock_quantity trong products
  UPDATE public.products
  SET stock_quantity = stock_quantity - p_quantity
  WHERE id = p_product_id;
  
  RETURN total_cost;
END;
$$ LANGUAGE plpgsql;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
