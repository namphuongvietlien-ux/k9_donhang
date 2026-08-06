-- =====================================================
-- ADD SALES CHANNEL TO STOCK OUT TRANSACTIONS
-- Cho phép chọn kênh bán hàng khi xuất kho (Shopee, TikTok, GHN, Website)
-- =====================================================

-- 1. Add sales_channel column to stock_out_transactions
ALTER TABLE public.stock_out_transactions
ADD COLUMN IF NOT EXISTS sales_channel VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ecommerce_order_id UUID REFERENCES public.ecommerce_orders(id) ON DELETE SET NULL;

-- 2. Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_stock_out_transactions_sales_channel 
ON public.stock_out_transactions(sales_channel) 
WHERE sales_channel IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_out_transactions_ecommerce_order_id 
ON public.stock_out_transactions(ecommerce_order_id) 
WHERE ecommerce_order_id IS NOT NULL;

-- 3. Add comments
COMMENT ON COLUMN public.stock_out_transactions.sales_channel IS 'Kênh bán hàng: shopee, tiktok, ghn, jt, website, hoặc NULL';
COMMENT ON COLUMN public.stock_out_transactions.ecommerce_order_id IS 'Link với đơn hàng TMĐT nếu xuất kho cho đơn hàng từ sàn TMĐT';

-- 4. Update trigger function to set sales_channel when order is confirmed
-- Nếu order có link với ecommerce_order, tự động set sales_channel
CREATE OR REPLACE FUNCTION create_stock_out_on_order_confirmed()
RETURNS TRIGGER AS $$
DECLARE
  stock_out_id_val UUID;
  order_item RECORD;
  stock_out_item_id_val UUID;
  trans_date DATE;
  cancelled_stock_out_id UUID;
  return_stock_in_id UUID;
  v_sales_channel VARCHAR(50);
  v_ecommerce_order_id UUID;
BEGIN
  -- Only process when status changes to 'confirmed'
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    -- Get transaction date (use order created_at date)
    trans_date := DATE(NEW.created_at);
    
    -- Check if order is linked to ecommerce_order
    SELECT 
      eo.platform_code,
      eo.id
    INTO 
      v_sales_channel,
      v_ecommerce_order_id
    FROM public.ecommerce_orders eo
    WHERE eo.internal_order_id = NEW.id
    LIMIT 1;
    
    -- If not linked to ecommerce, default to 'website'
    IF v_sales_channel IS NULL THEN
      v_sales_channel := 'website';
    END IF;
    
    -- Create stock out transaction
    INSERT INTO public.stock_out_transactions (
      transaction_date,
      type,
      order_id,
      sales_channel,
      ecommerce_order_id,
      notes
    ) VALUES (
      trans_date,
      'sale',
      NEW.id,
      v_sales_channel,
      v_ecommerce_order_id,
      'Tự động xuất kho từ đơn hàng ' || COALESCE(NEW.order_code, NEW.id::TEXT) || 
      CASE 
        WHEN v_sales_channel = 'website' THEN ' (Website)'
        WHEN v_sales_channel = 'shopee' THEN ' (Shopee)'
        WHEN v_sales_channel = 'tiktok' THEN ' (TikTok Shop)'
        WHEN v_sales_channel = 'ghn' THEN ' (GHN)'
        WHEN v_sales_channel = 'jt' THEN ' (J&T Express)'
        ELSE ''
      END
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
      NEW.created_at::DATE + INTERVAL '30 days',
      NEW.total_amount,
      NEW.total_amount,
      'pending'
    )
    ON CONFLICT DO NOTHING;
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
        INSERT INTO public.stock_in_items (
          stock_in_id,
          product_id,
          quantity,
          unit_price
        ) VALUES (
          return_stock_in_id,
          order_item.product_id,
          order_item.quantity,
          order_item.unit_cost
        );
      END LOOP;
      
      -- Delete or mark accounts receivable as cancelled
      UPDATE public.accounts_receivable
      SET status = 'paid',
          remaining_amount = 0,
          notes = COALESCE(notes, '') || ' - Đơn hàng đã hủy'
      WHERE order_id = NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
