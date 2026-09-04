-- DICH_VU = dịch vụ phòng khám (không cho nhập vào đơn / hóa đơn DV).
-- THUOC gồm cả vật tư y tế (VT).

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_category_group_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_category_group_check
  CHECK (
    category_group IS NULL
    OR category_group IN ('THUOC', 'HANG_HOA', 'DICH_VU')
  );

COMMENT ON COLUMN public.products.category_group IS
  'THUOC = thuốc + vật tư y tế; HANG_HOA = thức ăn / phụ kiện; DICH_VU = dịch vụ (không nhập vào phiếu).';

NOTIFY pgrst, 'reload schema';
