# SQL dán vào Supabase Dashboard → SQL Editor (chạy 1 lần)

-- 1) Thêm cột địa chỉ / nhãn in (nếu chưa có)
ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS short_name TEXT,
  ADD COLUMN IF NOT EXISTS print_name TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS username TEXT;

-- 2) Gán nhãn + địa chỉ đúng
UPDATE public.warehouses SET short_name='Q7', print_name='Q7', name='Kho Địa điểm kinh doanh Q7',
  address='Kho Q7 — Lê Văn Lương, P. Tân Hưng, Q.7, TP.HCM' WHERE code='Q7';
UPDATE public.warehouses SET short_name='Q8', print_name='Q8', name='Kho Địa điểm kinh doanh 02',
  address='86 Dương Bá Trạc, Q.8, TP.HCM' WHERE code='Q8';
UPDATE public.warehouses SET short_name='PH', print_name='PH', name='Kho Địa điểm kinh doanh 03',
  address='237 Phạm Hùng, Q.8, TP.HCM' WHERE code='PH';
UPDATE public.warehouses SET short_name='Q5', print_name='Q5', name='Kho Địa điểm kinh doanh 04',
  address='7 Trần Hưng Đạo, Q.5, TP.HCM' WHERE code='Q5';
UPDATE public.warehouses SET short_name='Q1', print_name='Q1', name='Kho Địa điểm kinh doanh 05',
  address='140 Nguyễn Văn Cừ, Q.1, TP.HCM' WHERE code='Q1';

-- ĐÚNG theo số nhà:
UPDATE public.warehouses SET short_name='Q4 Cũ', print_name='Q4 Cũ',
  name='Q4 Cũ — 178 Hoàng Diệu', address='178 Hoàng Diệu, Q.4, TP.HCM'
WHERE code='Q4_178';

UPDATE public.warehouses SET short_name='Q4 Mới', print_name='Q4 Mới',
  name='Q4 Mới — 275 Hoàng Diệu', address='275 Hoàng Diệu, Q.4, TP.HCM'
WHERE code='Q4_275';

NOTIFY pgrst, 'reload schema';
