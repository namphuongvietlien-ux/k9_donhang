-- Nhóm ngành hàng trên catalog: THUOC | HANG_HOA | DICH_VU
-- Chạy kèm scripts/update-product-category-group.mjs

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_group text;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_category_group_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_category_group_check
  CHECK (
    category_group IS NULL
    OR category_group IN ('THUOC', 'HANG_HOA', 'DICH_VU')
  );

CREATE INDEX IF NOT EXISTS idx_products_category_group
  ON public.products (category_group);

COMMENT ON COLUMN public.products.category_group IS
  'THUOC = thuốc + vật tư y tế; HANG_HOA = thức ăn / phụ kiện; DICH_VU = dịch vụ (không nhập vào phiếu).';

NOTIFY pgrst, 'reload schema';
