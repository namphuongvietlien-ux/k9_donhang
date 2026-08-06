-- Parent_SKU + giữ cờ visual từ GAS Data_Excel / TON_VARIANT

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS parent_sku TEXT,
  ADD COLUMN IF NOT EXISTS is_new BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_out_stock BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.products.parent_sku IS 'GAS Data_Excel.Parent_SKU — nhóm biến thể';
COMMENT ON COLUMN public.products.is_new IS 'GAS Data_Excel.IsNew — Admin tick Hàng Mới (giữ khi import)';
COMMENT ON COLUMN public.products.is_out_stock IS 'GAS TON_VARIANT.IsOutStock — hết hàng (hết → gỡ is_new)';
COMMENT ON COLUMN public.products.is_locked IS 'GAS TON_VARIANT.IsLocked — khóa đặt hàng';

CREATE INDEX IF NOT EXISTS idx_products_parent_sku
  ON public.products (parent_sku)
  WHERE parent_sku IS NOT NULL AND parent_sku <> '';

CREATE INDEX IF NOT EXISTS idx_products_is_new
  ON public.products (is_new)
  WHERE is_new = TRUE;

CREATE INDEX IF NOT EXISTS idx_products_is_out_stock
  ON public.products (is_out_stock)
  WHERE is_out_stock = TRUE;

CREATE INDEX IF NOT EXISTS idx_products_is_locked
  ON public.products (is_locked)
  WHERE is_locked = TRUE;

CREATE INDEX IF NOT EXISTS idx_products_created_at_desc
  ON public.products (created_at DESC);

NOTIFY pgrst, 'reload schema';
