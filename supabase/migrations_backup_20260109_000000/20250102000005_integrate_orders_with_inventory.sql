-- =====================================================
-- INVENTORY & ACCOUNTING SYSTEM - PHASE 7
-- Integrate orders with inventory system
-- Auto create stock out and accounts receivable when order is confirmed
-- =====================================================

-- 1. Function: Create stock out transaction when order is confirmed
CREATE OR REPLACE FUNCTION create_stock_out_on_order_confirmed()
RETURNS TRIGGER AS $$
DECLARE
  stock_out_id_val UUID;
  order_item RECORD;
  stock_out_item_id_val UUID;
  trans_date DATE;
  cancelled_stock_out_id UUID;
  return_stock_in_id UUID;
BEGIN
  -- Only process when status changes to 'confirmed'
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    -- Get transaction date (use order created_at date)
    trans_date := DATE(NEW.created_at);
    
    -- Create stock out transaction
    INSERT INTO public.stock_out_transactions (
      transaction_date,
      type,
      order_id,
      notes
    ) VALUES (
      trans_date,
      'sale',
      NEW.id,
      'Tự động xuất kho từ đơn hàng ' || COALESCE(NEW.order_code, NEW.id::TEXT)
    )
    RETURNING id INTO stock_out_id_val;
    
    -- Process each order item
    FOR order_item IN
      SELECT 
        oi.id,
        oi.product_slug,
        oi.quantity,
        p.id as product_id
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.slug = oi.product_slug
      WHERE oi.order_id = NEW.id
    LOOP
      -- Only process if product exists
      IF order_item.product_id IS NOT NULL THEN
        -- Create stock out item (trigger will handle FIFO and stock update)
        INSERT INTO public.stock_out_items (
          stock_out_id,
          product_id,
          quantity,
          unit_cost,
          total_cost
        ) VALUES (
          stock_out_id_val,
          order_item.product_id,
          order_item.quantity,
          0, -- Will be calculated by trigger
          0  -- Will be calculated by trigger
        )
        RETURNING id INTO stock_out_item_id_val;
      END IF;
    END LOOP;
    
    -- Create accounts receivable if order is not fully paid
    -- Assume order is not paid if status is just confirmed
    -- You can add a payment_status field to orders table if needed
    INSERT INTO public.accounts_receivable (
      order_id,
      customer_name,
      customer_phone,
      due_date,
      original_amount,
      remaining_amount,
      status
    ) VALUES (
      NEW.id,
      NEW.customer_name,
      NEW.customer_phone,
      NEW.created_at::DATE + INTERVAL '30 days', -- Default 30 days payment terms
      NEW.total_amount,
      NEW.total_amount,
      'pending'
    )
    ON CONFLICT DO NOTHING; -- Prevent duplicate if already exists
  END IF;
  
    -- Handle order cancellation - return stock
  IF NEW.status = 'cancelled' AND OLD.status = 'confirmed' THEN
    -- Find the stock out transaction for this order
    SELECT id INTO cancelled_stock_out_id
    FROM public.stock_out_transactions
    WHERE order_id = NEW.id
      AND type = 'sale'
    LIMIT 1;
    
    IF cancelled_stock_out_id IS NOT NULL THEN
      -- Create stock in transaction (return type)
      INSERT INTO public.stock_in_transactions (
        transaction_date,
        type,
        reference_number,
        notes
      ) VALUES (
        CURRENT_DATE,
        'return',
        'Hủy đơn hàng ' || COALESCE(NEW.order_code, NEW.id::TEXT),
        'Trả hàng do hủy đơn hàng'
      )
      RETURNING id INTO return_stock_in_id;
      
      -- Return each item to stock
      FOR order_item IN
        SELECT 
          soi.product_id,
          soi.quantity,
          soi.unit_cost
        FROM public.stock_out_items soi
        WHERE soi.stock_out_id = cancelled_stock_out_id
      LOOP
        -- Create stock in item (will create inventory_lot and update stock)
        INSERT INTO public.stock_in_items (
          stock_in_id,
          product_id,
          quantity,
          unit_price
        ) VALUES (
          return_stock_in_id,
          order_item.product_id,
          order_item.quantity,
          order_item.unit_cost -- Use the original cost
        );
      END LOOP;
      
      -- Delete or mark accounts receivable as cancelled
      UPDATE public.accounts_receivable
      SET status = 'paid', -- Mark as paid since order is cancelled
          remaining_amount = 0,
          notes = COALESCE(notes, '') || ' - Đơn hàng đã hủy'
      WHERE order_id = NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create trigger on orders table
CREATE TRIGGER trigger_create_stock_out_on_order_confirmed
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION create_stock_out_on_order_confirmed();

-- 3. Function: Check stock availability before order creation
CREATE OR REPLACE FUNCTION check_stock_availability(
  p_product_slug TEXT,
  p_quantity INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  available_stock INTEGER;
BEGIN
  SELECT stock_quantity INTO available_stock
  FROM public.products
  WHERE slug = p_product_slug
    AND is_active = true;
  
  IF available_stock IS NULL THEN
    RETURN false;
  END IF;
  
  RETURN available_stock >= p_quantity;
END;
$$ LANGUAGE plpgsql;

-- 4. Function: Get available stock for a product
CREATE OR REPLACE FUNCTION get_product_stock(p_product_slug TEXT)
RETURNS INTEGER AS $$
DECLARE
  stock_qty INTEGER;
BEGIN
  SELECT stock_quantity INTO stock_qty
  FROM public.products
  WHERE slug = p_product_slug
    AND is_active = true;
  
  RETURN COALESCE(stock_qty, 0);
END;
$$ LANGUAGE plpgsql;

