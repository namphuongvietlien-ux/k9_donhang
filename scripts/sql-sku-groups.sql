-- Nhóm SKU cấp 1/2 + stamp updated_at khi đổi tồn.
-- Chạy kèm scripts/update-sku-groups.mjs

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sku_industry text;
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sku_detail text;

CREATE INDEX IF NOT EXISTS idx_products_sku_industry
  ON public.products (sku_industry);
CREATE INDEX IF NOT EXISTS idx_products_sku_detail
  ON public.products (sku_industry, sku_detail);

CREATE OR REPLACE FUNCTION public.touch_stock_on_hand_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_stock_on_hand_updated_at ON public.stock_on_hand;
CREATE TRIGGER trg_touch_stock_on_hand_updated_at
  BEFORE UPDATE ON public.stock_on_hand
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_stock_on_hand_updated_at();

NOTIFY pgrst, 'reload schema';
