-- ============================================================
-- CHẠY 1 LẦN trên Supabase Dashboard → SQL Editor → Run
-- File: scripts/sql-apply-all-pending.sql
-- ============================================================

-- A) Địa chỉ + nhãn kho (Q4 Cũ / Q4 Mới)
ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS short_name TEXT,
  ADD COLUMN IF NOT EXISTS print_name TEXT;

UPDATE public.warehouses SET short_name='Q7', print_name='Q7',
  name='Kho Địa điểm kinh doanh Q7',
  address='Kho Q7 — Lê Văn Lương, P. Tân Hưng, Q.7, TP.HCM' WHERE code='Q7';
UPDATE public.warehouses SET short_name='Q8', print_name='Q8',
  name='Kho Địa điểm kinh doanh 02',
  address='86 Dương Bá Trạc, Q.8, TP.HCM' WHERE code='Q8';
UPDATE public.warehouses SET short_name='PH', print_name='PH',
  name='Kho Địa điểm kinh doanh 03',
  address='237 Phạm Hùng, Q.8, TP.HCM' WHERE code='PH';
UPDATE public.warehouses SET short_name='Q5', print_name='Q5',
  name='Kho Địa điểm kinh doanh 04',
  address='7 Trần Hưng Đạo, Q.5, TP.HCM' WHERE code='Q5';
UPDATE public.warehouses SET short_name='Q1', print_name='Q1',
  name='Kho Địa điểm kinh doanh 05',
  address='140 Nguyễn Văn Cừ, Q.1, TP.HCM' WHERE code='Q1';

-- ĐÚNG: Q4_178 = Q4 Cũ (178), Q4_275 = Q4 Mới (275)
UPDATE public.warehouses SET short_name='Q4 Cũ', print_name='Q4 Cũ',
  name='Q4 Cũ — 178 Hoàng Diệu', address='178 Hoàng Diệu, Q.4, TP.HCM'
WHERE code='Q4_178';
UPDATE public.warehouses SET short_name='Q4 Mới', print_name='Q4 Mới',
  name='Q4 Mới — 275 Hoàng Diệu', address='275 Hoàng Diệu, Q.4, TP.HCM'
WHERE code='Q4_275';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS username TEXT;

-- B) Bảng Xuất bán (XB)
CREATE TABLE IF NOT EXISTS public.sales_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_code TEXT NOT NULL,
  invoice_no TEXT NOT NULL,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  warehouse_code TEXT,
  warehouse_name TEXT,
  status TEXT NOT NULL DEFAULT 'saved',
  notes TEXT,
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (voucher_code)
);

ALTER TABLE public.sales_vouchers
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.sales_voucher_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES public.sales_vouchers(id) ON DELETE CASCADE,
  product_slug TEXT,
  barcode TEXT,
  product_name TEXT NOT NULL,
  unit TEXT,
  quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  line_kind TEXT NOT NULL DEFAULT 'HANG',
  service_cost NUMERIC(14, 2),
  line_notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_vouchers_invoice ON public.sales_vouchers (invoice_no);
CREATE INDEX IF NOT EXISTS idx_sales_vouchers_created ON public.sales_vouchers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_voucher_items_voucher ON public.sales_voucher_items (voucher_id);

ALTER TABLE public.sales_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_voucher_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage sales_vouchers" ON public.sales_vouchers;
CREATE POLICY "Admins manage sales_vouchers"
ON public.sales_vouchers FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins manage sales_voucher_items" ON public.sales_voucher_items;
CREATE POLICY "Admins manage sales_voucher_items"
ON public.sales_voucher_items FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_vouchers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_voucher_items TO authenticated;

NOTIFY pgrst, 'reload schema';
