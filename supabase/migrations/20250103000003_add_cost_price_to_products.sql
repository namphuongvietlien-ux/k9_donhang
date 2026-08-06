-- Add cost price and profit management columns to products table
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS cost_price DECIMAL(12, 0) DEFAULT 0, -- Giá vốn hiện tại (có thể cập nhật thủ công)
ADD COLUMN IF NOT EXISTS profit_margin DECIMAL(5, 2), -- Biên lợi nhuận mong muốn (%)
ADD COLUMN IF NOT EXISTS auto_calculate_profit BOOLEAN DEFAULT false; -- Tự động tính giá bán từ giá vốn

-- Add comments
COMMENT ON COLUMN public.products.cost_price IS 'Giá vốn hiện tại. Có thể cập nhật thủ công hoặc tự động từ average_cost';
COMMENT ON COLUMN public.products.profit_margin IS 'Biên lợi nhuận mong muốn (%). Ví dụ: 30 = 30%';
COMMENT ON COLUMN public.products.auto_calculate_profit IS 'Nếu true, tự động tính price = cost_price * (1 + profit_margin/100) khi cập nhật cost_price hoặc profit_margin';

-- Initialize cost_price from average_cost for existing products
UPDATE public.products
SET cost_price = COALESCE(average_cost, 0)
WHERE cost_price = 0 AND average_cost > 0;

