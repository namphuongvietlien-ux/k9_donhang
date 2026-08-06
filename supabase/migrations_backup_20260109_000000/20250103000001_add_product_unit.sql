-- Add unit_name column to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS unit_name TEXT DEFAULT 'Sản phẩm';

-- Add comment
COMMENT ON COLUMN public.products.unit_name IS 'Đơn vị tính sản phẩm (ví dụ: Hộp, Thùng, Chai, Gói, ...)';

