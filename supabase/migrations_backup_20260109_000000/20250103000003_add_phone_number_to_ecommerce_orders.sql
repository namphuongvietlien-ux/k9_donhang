-- Add phone_number column to ecommerce_orders
-- This stores the full 10-digit phone number, while phone_last_4 is used for tracking lookup

ALTER TABLE public.ecommerce_orders 
ADD COLUMN IF NOT EXISTS phone_number VARCHAR(10);

-- Add index for phone_number
CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_phone_number ON public.ecommerce_orders(phone_number);

-- Comment
COMMENT ON COLUMN public.ecommerce_orders.phone_number IS 'Số điện thoại đầy đủ (10 số) của khách hàng';
COMMENT ON COLUMN public.ecommerce_orders.phone_last_4 IS '4 số cuối điện thoại (dùng để tra cứu J&T tracking)';

