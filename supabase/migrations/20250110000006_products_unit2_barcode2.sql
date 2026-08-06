-- GAS Data_Excel.DonViTinh2 — ĐVT phụ + mã vạch tương ứng (quy cách Gói/Thùng…)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unit_2 TEXT,
  ADD COLUMN IF NOT EXISTS barcode_2 TEXT;

COMMENT ON COLUMN public.products.unit_2 IS 'ĐVT phụ — GAS DonViTinh2';
COMMENT ON COLUMN public.products.barcode_2 IS 'Mã vạch của ĐVT phụ (nếu khác barcode chính)';

CREATE INDEX IF NOT EXISTS idx_products_barcode_2
  ON public.products (barcode_2)
  WHERE barcode_2 IS NOT NULL AND barcode_2 <> '';

NOTIFY pgrst, 'reload schema';
