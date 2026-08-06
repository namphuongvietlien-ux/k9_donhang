-- =====================================================
-- FIX: Inventory Lots Constraint Issue
-- Fix the constraint violation when stock out reduces quantity to 0 or negative
-- =====================================================

-- 1. Update the constraint to allow quantity >= 0 (instead of > 0)
-- This allows lots to be reduced to 0, then we can delete them
ALTER TABLE public.inventory_lots
DROP CONSTRAINT IF EXISTS inventory_lots_quantity_check;

ALTER TABLE public.inventory_lots
ADD CONSTRAINT inventory_lots_quantity_check CHECK (quantity >= 0);

-- 2. Update inventory_movements foreign key to allow NULL when lot is deleted
-- This preserves movement history even when lots are deleted
ALTER TABLE public.inventory_movements
DROP CONSTRAINT IF EXISTS inventory_movements_lot_id_fkey;

ALTER TABLE public.inventory_movements
ADD CONSTRAINT inventory_movements_lot_id_fkey 
FOREIGN KEY (lot_id) 
REFERENCES public.inventory_lots(id) 
ON DELETE SET NULL;

-- 3. Make lot_id nullable to allow historical records
ALTER TABLE public.inventory_movements
ALTER COLUMN lot_id DROP NOT NULL;

-- 2. Update stock_out_fifo function to handle quantity = 0 properly
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
BEGIN
  -- Lấy các lô theo thứ tự FIFO (lô cũ nhất trước)
  FOR lot_record IN
    SELECT id, quantity, unit_price
    FROM public.inventory_lots
    WHERE product_id = p_product_id
      AND quantity > 0
    ORDER BY received_date ASC, created_at ASC
  LOOP
    -- Nếu đã lấy đủ số lượng, thoát
    EXIT WHEN remaining_qty <= 0;
    
    -- Số lượng lấy từ lô này
    lot_qty := LEAST(remaining_qty, lot_record.quantity);
    lot_cost := lot_record.unit_price;
    lot_id_val := lot_record.id;
    new_quantity := lot_record.quantity - lot_qty;
    
    -- Ghi nhận vào inventory_movements TRƯỚC khi xóa/cập nhật lô
    -- (để tránh foreign key constraint violation)
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
      -- Xóa lô nếu đã hết (sau khi đã insert vào movements)
      DELETE FROM public.inventory_lots
      WHERE id = lot_id_val;
    ELSE
      -- Cập nhật số lượng trong lô
      UPDATE public.inventory_lots
      SET quantity = new_quantity,
          updated_at = now()
      WHERE id = lot_id_val;
    END IF;
    
    -- Tính tổng giá vốn
    total_cost := total_cost + (lot_qty * lot_cost);
    remaining_qty := remaining_qty - lot_qty;
  END LOOP;
  
  -- Cập nhật stock_quantity trong products
  UPDATE public.products
  SET stock_quantity = stock_quantity - p_quantity
  WHERE id = p_product_id;
  
  RETURN total_cost;
END;
$$ LANGUAGE plpgsql;

