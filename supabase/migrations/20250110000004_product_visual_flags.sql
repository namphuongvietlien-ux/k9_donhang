-- Visual flags từ GAS Data_Excel / TON_VARIANT (IsNew, IsOutStock, IsLocked)

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_new BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_out_stock BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.products.is_new IS 'GAS Data_Excel.IsNew — hàng mới';
COMMENT ON COLUMN public.products.is_out_stock IS 'GAS TON_VARIANT.IsOutStock — hết hàng';
COMMENT ON COLUMN public.products.is_locked IS 'GAS TON_VARIANT.IsLocked — khóa mã / ngừng giao dịch';

CREATE INDEX IF NOT EXISTS idx_products_is_new ON public.products(is_new) WHERE is_new = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_is_out_stock ON public.products(is_out_stock) WHERE is_out_stock = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_is_locked ON public.products(is_locked) WHERE is_locked = TRUE;

NOTIFY pgrst, 'reload schema';
