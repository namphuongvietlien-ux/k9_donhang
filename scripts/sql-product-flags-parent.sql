-- Chạy trên Supabase SQL Editor nếu chưa migrate
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS parent_sku TEXT,
  ADD COLUMN IF NOT EXISTS is_new BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_out_stock BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_products_parent_sku
  ON public.products (parent_sku)
  WHERE parent_sku IS NOT NULL AND parent_sku <> '';

CREATE INDEX IF NOT EXISTS idx_products_is_new
  ON public.products (is_new) WHERE is_new = TRUE;

CREATE INDEX IF NOT EXISTS idx_products_is_out_stock
  ON public.products (is_out_stock) WHERE is_out_stock = TRUE;

CREATE INDEX IF NOT EXISTS idx_products_is_locked
  ON public.products (is_locked) WHERE is_locked = TRUE;

NOTIFY pgrst, 'reload schema';
