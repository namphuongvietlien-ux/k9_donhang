-- Add stock quantity column to products table
ALTER TABLE public.products 
ADD COLUMN stock_quantity integer NOT NULL DEFAULT 0,
ADD COLUMN low_stock_threshold integer NOT NULL DEFAULT 10;

-- Add index for low stock queries
CREATE INDEX idx_products_stock ON public.products(stock_quantity) WHERE is_active = true;