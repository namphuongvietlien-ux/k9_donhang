-- Extend packing schema to match GAS (kho xuất / kho nhận) + seed all stores

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.orders.warehouse_id IS 'Kho nhận (chi nhánh) — GAS: khoNhan';
COMMENT ON COLUMN public.orders.source_warehouse_id IS 'Kho xuất / soạn — GAS: khoXuat (thường Q7)';

CREATE INDEX IF NOT EXISTS idx_orders_source_warehouse ON public.orders(source_warehouse_id);

-- Seed full warehouse list from GAS STORE_MAP
INSERT INTO public.warehouses (code, name, sort_order)
VALUES
  ('Q7', 'Kho Địa điểm kinh doanh Q7', 1),
  ('Q8', 'Kho Địa điểm kinh doanh 02', 2),
  ('PH', 'Kho Địa điểm kinh doanh 03', 3),
  ('Q5', 'Kho Địa điểm kinh doanh 04', 4),
  ('Q1', 'Kho Địa điểm kinh doanh 05', 5),
  ('Q4_178', 'Kho Địa điểm kinh doanh 01', 6),
  ('Q4_275', 'Kho Địa điểm kinh doanh 06', 7)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();
