-- =====================================================
-- INVENTORY & ACCOUNTING SYSTEM - PHASE 1
-- Create functions for automatic operations
-- =====================================================

-- 1. Function: Generate stock in code (PN + YYYYMMDD + số thứ tự)
CREATE OR REPLACE FUNCTION generate_stock_in_code()
RETURNS TEXT AS $$
DECLARE
  today DATE := CURRENT_DATE;
  date_str TEXT := TO_CHAR(today, 'YYYYMMDD');
  last_code TEXT;
  last_num INTEGER := 0;
  new_code TEXT;
BEGIN
  -- Lấy mã phiếu cuối cùng trong ngày
  SELECT code INTO last_code
  FROM public.stock_in_transactions
  WHERE code LIKE 'PN' || date_str || '%'
  ORDER BY code DESC
  LIMIT 1;
  
  -- Tách số thứ tự
  IF last_code IS NOT NULL THEN
    last_num := CAST(SUBSTRING(last_code FROM 11) AS INTEGER);
  END IF;
  
  -- Tạo mã mới
  new_code := 'PN' || date_str || LPAD((last_num + 1)::TEXT, 3, '0');
  
  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- 2. Function: Generate stock out code (PX + YYYYMMDD + số thứ tự)
CREATE OR REPLACE FUNCTION generate_stock_out_code()
RETURNS TEXT AS $$
DECLARE
  today DATE := CURRENT_DATE;
  date_str TEXT := TO_CHAR(today, 'YYYYMMDD');
  last_code TEXT;
  last_num INTEGER := 0;
  new_code TEXT;
BEGIN
  -- Lấy mã phiếu cuối cùng trong ngày
  SELECT code INTO last_code
  FROM public.stock_out_transactions
  WHERE code LIKE 'PX' || date_str || '%'
  ORDER BY code DESC
  LIMIT 1;
  
  -- Tách số thứ tự
  IF last_code IS NOT NULL THEN
    last_num := CAST(SUBSTRING(last_code FROM 11) AS INTEGER);
  END IF;
  
  -- Tạo mã mới
  new_code := 'PX' || date_str || LPAD((last_num + 1)::TEXT, 3, '0');
  
  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- 3. Function: Generate supplier code (NCC + số thứ tự)
CREATE OR REPLACE FUNCTION generate_supplier_code()
RETURNS TEXT AS $$
DECLARE
  last_code TEXT;
  last_num INTEGER := 0;
  new_code TEXT;
BEGIN
  -- Lấy mã nhà cung cấp cuối cùng
  SELECT code INTO last_code
  FROM public.suppliers
  WHERE code LIKE 'NCC%'
  ORDER BY code DESC
  LIMIT 1;
  
  -- Tách số thứ tự
  IF last_code IS NOT NULL THEN
    last_num := CAST(SUBSTRING(last_code FROM 4) AS INTEGER);
  END IF;
  
  -- Tạo mã mới
  new_code := 'NCC' || LPAD((last_num + 1)::TEXT, 3, '0');
  
  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- 4. Function: Generate customer code (KH + số thứ tự)
CREATE OR REPLACE FUNCTION generate_customer_code()
RETURNS TEXT AS $$
DECLARE
  last_code TEXT;
  last_num INTEGER := 0;
  new_code TEXT;
BEGIN
  -- Lấy mã khách hàng cuối cùng
  SELECT code INTO last_code
  FROM public.customers
  WHERE code LIKE 'KH%'
  ORDER BY code DESC
  LIMIT 1;
  
  -- Tách số thứ tự
  IF last_code IS NOT NULL THEN
    last_num := CAST(SUBSTRING(last_code FROM 3) AS INTEGER);
  END IF;
  
  -- Tạo mã mới
  new_code := 'KH' || LPAD((last_num + 1)::TEXT, 3, '0');
  
  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- 5. Function: Update stock on stock in (Trigger function)
CREATE OR REPLACE FUNCTION update_stock_on_in()
RETURNS TRIGGER AS $$
DECLARE
  trans_date DATE;
BEGIN
  -- Lấy ngày giao dịch
  SELECT transaction_date INTO trans_date
  FROM public.stock_in_transactions
  WHERE id = NEW.stock_in_id;
  
  -- Tạo inventory_lot mới
  INSERT INTO public.inventory_lots (
    product_id,
    stock_in_item_id,
    quantity,
    unit_price,
    batch_number,
    expiry_date,
    received_date
  ) VALUES (
    NEW.product_id,
    NEW.id,
    NEW.quantity,
    NEW.unit_price,
    NEW.batch_number,
    NEW.expiry_date,
    COALESCE(trans_date, CURRENT_DATE)
  );
  
  -- Cập nhật stock_quantity và average_cost trong products
  UPDATE public.products
  SET 
    stock_quantity = stock_quantity + NEW.quantity,
    last_purchase_price = NEW.unit_price,
    average_cost = (
      SELECT 
        CASE 
          WHEN SUM(quantity) > 0 THEN 
            SUM(quantity * unit_price) / SUM(quantity)
          ELSE 0
        END
      FROM public.inventory_lots
      WHERE product_id = NEW.product_id
        AND quantity > 0
    )
  WHERE id = NEW.product_id;
  
  -- Ghi nhận vào inventory_movements
  INSERT INTO public.inventory_movements (
    lot_id,
    movement_type,
    quantity,
    unit_price,
    movement_date
  )
  SELECT 
    id,
    'in',
    NEW.quantity,
    NEW.unit_price,
    COALESCE(trans_date, CURRENT_DATE)
  FROM public.inventory_lots
  WHERE stock_in_item_id = NEW.id
  LIMIT 1;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Function: Stock out using FIFO
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
    
    -- Cập nhật số lượng trong lô
    UPDATE public.inventory_lots
    SET quantity = quantity - lot_qty,
        updated_at = now()
    WHERE id = lot_id_val;
    
    -- Ghi nhận vào inventory_movements
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

-- 7. Function: Update stock on stock out (Trigger function)
CREATE OR REPLACE FUNCTION update_stock_on_out()
RETURNS TRIGGER AS $$
DECLARE
  trans_date DATE;
  calculated_cost DECIMAL(12, 0);
BEGIN
  -- Lấy ngày giao dịch
  SELECT transaction_date INTO trans_date
  FROM public.stock_out_transactions
  WHERE id = NEW.stock_out_id;
  
  -- Tính giá vốn theo FIFO
  SELECT stock_out_fifo(
    NEW.product_id,
    NEW.quantity,
    NEW.id,
    COALESCE(trans_date, CURRENT_DATE)
  ) INTO calculated_cost;
  
  -- Cập nhật giá vốn trong stock_out_items
  UPDATE public.stock_out_items
  SET 
    unit_cost = CASE 
      WHEN NEW.quantity > 0 THEN calculated_cost / NEW.quantity 
      ELSE 0 
    END,
    total_cost = calculated_cost
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Function: Create accounts payable (Trigger function)
CREATE OR REPLACE FUNCTION create_accounts_payable()
RETURNS TRIGGER AS $$
DECLARE
  supplier_payment_terms INTEGER;
  due_date DATE;
BEGIN
  -- Chỉ tạo công nợ nếu có nhà cung cấp và chưa thanh toán
  IF NEW.supplier_id IS NOT NULL AND NEW.is_paid = false THEN
    -- Lấy số ngày được nợ từ supplier
    SELECT payment_terms INTO supplier_payment_terms
    FROM public.suppliers
    WHERE id = NEW.supplier_id;
    
    -- Mặc định 30 ngày nếu không có
    IF supplier_payment_terms IS NULL THEN
      supplier_payment_terms := 30;
    END IF;
    
    -- Tính ngày đáo hạn
    due_date := NEW.transaction_date + (supplier_payment_terms || ' days')::INTERVAL;
    
    -- Tạo công nợ phải trả
    INSERT INTO public.accounts_payable (
      supplier_id,
      stock_in_id,
      reference_number,
      reference_date,
      due_date,
      original_amount,
      remaining_amount,
      status
    ) VALUES (
      NEW.supplier_id,
      NEW.id,
      NEW.reference_number,
      NEW.reference_date,
      due_date,
      NEW.total_amount,
      NEW.total_amount,
      'pending'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Function: Update accounts payable status
CREATE OR REPLACE FUNCTION update_accounts_payable_status()
RETURNS TRIGGER AS $$
DECLARE
  new_status TEXT;
BEGIN
  -- Tính toán trạng thái mới
  IF NEW.remaining_amount <= 0 THEN
    new_status := 'paid';
  ELSIF NEW.paid_amount > 0 AND NEW.paid_amount < NEW.original_amount THEN
    new_status := 'partial';
  ELSIF NEW.due_date < CURRENT_DATE AND NEW.remaining_amount > 0 THEN
    new_status := 'overdue';
  ELSE
    new_status := 'pending';
  END IF;
  
  -- Cập nhật trạng thái
  NEW.status := new_status;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. Function: Update accounts receivable status
CREATE OR REPLACE FUNCTION update_accounts_receivable_status()
RETURNS TRIGGER AS $$
DECLARE
  new_status TEXT;
BEGIN
  -- Tính toán trạng thái mới
  IF NEW.remaining_amount <= 0 THEN
    new_status := 'paid';
  ELSIF NEW.paid_amount > 0 AND NEW.paid_amount < NEW.original_amount THEN
    new_status := 'partial';
  ELSIF NEW.due_date < CURRENT_DATE AND NEW.remaining_amount > 0 THEN
    new_status := 'overdue';
  ELSE
    new_status := 'pending';
  END IF;
  
  -- Cập nhật trạng thái
  NEW.status := new_status;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 11. Function: Update accounts payable when payment is made
CREATE OR REPLACE FUNCTION update_accounts_payable_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  -- Cập nhật paid_amount và remaining_amount
  UPDATE public.accounts_payable
  SET 
    paid_amount = paid_amount + NEW.amount,
    remaining_amount = remaining_amount - NEW.amount,
    updated_at = now()
  WHERE id = NEW.accounts_payable_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 12. Function: Update accounts receivable when payment is received
CREATE OR REPLACE FUNCTION update_accounts_receivable_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  -- Cập nhật paid_amount và remaining_amount
  UPDATE public.accounts_receivable
  SET 
    paid_amount = paid_amount + NEW.amount,
    remaining_amount = remaining_amount - NEW.amount,
    updated_at = now()
  WHERE id = NEW.accounts_receivable_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

