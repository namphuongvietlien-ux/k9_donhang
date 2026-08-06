-- Kho: địa chỉ + tên in (Q4 Cũ / Q4 Mới) · gán user → kho
ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS short_name TEXT,
  ADD COLUMN IF NOT EXISTS print_name TEXT;

COMMENT ON COLUMN public.warehouses.address IS 'Địa chỉ in trên phiếu';
COMMENT ON COLUMN public.warehouses.short_name IS 'Nhãn ngắn trên bảng tổng hợp (Q4 Mới, Q8…)';
COMMENT ON COLUMN public.warehouses.print_name IS 'Tên hiển thị khi in';

UPDATE public.warehouses SET
  short_name = 'Q7',
  print_name = 'Q7',
  name = 'Kho Địa điểm kinh doanh Q7',
  address = 'Kho Q7 — Lê Văn Lương, P. Tân Hưng, Q.7, TP.HCM'
WHERE code = 'Q7';

UPDATE public.warehouses SET
  short_name = 'Q8',
  print_name = 'Q8',
  name = 'Kho Địa điểm kinh doanh 02',
  address = '86 Dương Bá Trạc, Q.8, TP.HCM'
WHERE code = 'Q8';

UPDATE public.warehouses SET
  short_name = 'PH',
  print_name = 'PH',
  name = 'Kho Địa điểm kinh doanh 03',
  address = '237 Phạm Hùng, Q.8, TP.HCM'
WHERE code = 'PH';

UPDATE public.warehouses SET
  short_name = 'Q5',
  print_name = 'Q5',
  name = 'Kho Địa điểm kinh doanh 04',
  address = '7 Trần Hưng Đạo, Q.5, TP.HCM'
WHERE code = 'Q5';

UPDATE public.warehouses SET
  short_name = 'Q1',
  print_name = 'Q1',
  name = 'Kho Địa điểm kinh doanh 05',
  address = '140 Nguyễn Văn Cừ, Q.1, TP.HCM'
WHERE code = 'Q1';

-- GAS đúng theo địa chỉ số nhà:
-- Q4_178 → Q4 Cũ (178 Hoàng Diệu)
-- Q4_275 → Q4 Mới (275 Hoàng Diệu)
UPDATE public.warehouses SET
  short_name = 'Q4 Cũ',
  print_name = 'Q4 Cũ',
  name = 'Q4 Cũ — 178 Hoàng Diệu',
  address = '178 Hoàng Diệu, Q.4, TP.HCM'
WHERE code = 'Q4_178';

UPDATE public.warehouses SET
  short_name = 'Q4 Mới',
  print_name = 'Q4 Mới',
  name = 'Q4 Mới — 275 Hoàng Diệu',
  address = '275 Hoàng Diệu, Q.4, TP.HCM'
WHERE code = 'Q4_275';

-- Gán tài khoản chi nhánh → kho (username GAS)
-- profiles dùng user_id (không phải id = auth.users.id)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_warehouse
  ON public.profiles (warehouse_id);

COMMENT ON COLUMN public.profiles.warehouse_id IS 'NULL = Tất cả kho (Admin); có giá trị = Chi nhánh';
COMMENT ON COLUMN public.profiles.username IS 'Login dạng GAS (admin, Q7, 275hd…)';

NOTIFY pgrst, 'reload schema';
