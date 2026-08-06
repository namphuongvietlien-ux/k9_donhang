-- Add settlement (quyết toán tiền) columns to ecommerce_orders
ALTER TABLE public.ecommerce_orders 
ADD COLUMN IF NOT EXISTS settlement_status VARCHAR(20) DEFAULT 'pending' CHECK (settlement_status IN ('pending', 'partial', 'completed', 'cancelled')),
ADD COLUMN IF NOT EXISTS settlement_amount DECIMAL(12, 0) DEFAULT 0,
ADD COLUMN IF NOT EXISTS settlement_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS settlement_notes TEXT;

-- Create index for settlement queries
CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_settlement_status ON public.ecommerce_orders(settlement_status);
CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_settlement_date ON public.ecommerce_orders(settlement_date);

-- Comments
COMMENT ON COLUMN public.ecommerce_orders.settlement_status IS 'Trạng thái quyết toán: pending (chưa quyết toán), partial (quyết toán một phần), completed (đã quyết toán), cancelled (đã hủy)';
COMMENT ON COLUMN public.ecommerce_orders.settlement_amount IS 'Số tiền đã quyết toán (VNĐ)';
COMMENT ON COLUMN public.ecommerce_orders.settlement_date IS 'Ngày quyết toán';
COMMENT ON COLUMN public.ecommerce_orders.settlement_notes IS 'Ghi chú về quyết toán';

