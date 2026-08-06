-- K9: barcode + unit snapshot trên order_items; barcode trên products

-- 1) products.barcode (unit đã có từ migration inventory)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS barcode TEXT;

COMMENT ON COLUMN public.products.barcode IS 'Mã vạch / EAN — GAS Data_Excel.Mã vạch';
COMMENT ON COLUMN public.products.unit IS 'Đơn vị tính chính — GAS ĐVT';

CREATE INDEX IF NOT EXISTS idx_products_barcode
  ON public.products (barcode)
  WHERE barcode IS NOT NULL AND barcode <> '';

-- 2) order_items: snapshot tại thời điểm tạo đơn
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS barcode TEXT,
  ADD COLUMN IF NOT EXISTS unit TEXT;

COMMENT ON COLUMN public.order_items.barcode IS 'Snapshot mã vạch lúc tạo phiếu (không đổi theo catalog)';
COMMENT ON COLUMN public.order_items.unit IS 'Snapshot ĐVT lúc tạo phiếu';

NOTIFY pgrst, 'reload schema';
