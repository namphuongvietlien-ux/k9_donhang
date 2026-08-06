-- Add cost price and profit columns to order_items table
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS cost_price DECIMAL(12, 0), -- Giá vốn tại thời điểm bán
ADD COLUMN IF NOT EXISTS profit DECIMAL(12, 0) DEFAULT 0, -- Lợi nhuận = (price - cost_price) * quantity
ADD COLUMN IF NOT EXISTS profit_margin DECIMAL(5, 2); -- Biên lợi nhuận = (price - cost_price) / price * 100

-- Add comments
COMMENT ON COLUMN public.order_items.cost_price IS 'Giá vốn tại thời điểm bán. Lấy từ products.cost_price hoặc products.average_cost';
COMMENT ON COLUMN public.order_items.profit IS 'Lợi nhuận = (price - cost_price) * quantity';
COMMENT ON COLUMN public.order_items.profit_margin IS 'Biên lợi nhuận (%) = (price - cost_price) / price * 100';

-- Create index for profit queries
CREATE INDEX IF NOT EXISTS idx_order_items_profit ON public.order_items(profit) WHERE profit IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_profit_margin ON public.order_items(profit_margin) WHERE profit_margin IS NOT NULL;

