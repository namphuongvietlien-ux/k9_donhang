-- Add picked_up_at column to ecommerce_orders
-- This stores the date when the order was first picked up by the courier

ALTER TABLE public.ecommerce_orders 
ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMP WITH TIME ZONE;

-- Add index for picked_up_at
CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_picked_up_at ON public.ecommerce_orders(picked_up_at);

-- Comment
COMMENT ON COLUMN public.ecommerce_orders.picked_up_at IS 'Ngày lấy hàng - thời điểm đơn vị vận chuyển nhận hàng lần đầu tiên (trạng thái "đã nhận hàng")';

