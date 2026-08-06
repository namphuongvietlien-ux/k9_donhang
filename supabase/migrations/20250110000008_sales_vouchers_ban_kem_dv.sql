-- Bán kèm DV / Xuất bán hàng (port GAS sheet "Xuất Bán Hàng")

CREATE TABLE IF NOT EXISTS public.sales_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_code TEXT NOT NULL,
  invoice_no TEXT NOT NULL,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  warehouse_code TEXT,
  warehouse_name TEXT,
  status TEXT NOT NULL DEFAULT 'saved',
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (voucher_code)
);

CREATE INDEX IF NOT EXISTS idx_sales_vouchers_invoice
  ON public.sales_vouchers (invoice_no);
CREATE INDEX IF NOT EXISTS idx_sales_vouchers_created
  ON public.sales_vouchers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_vouchers_warehouse
  ON public.sales_vouchers (warehouse_id);

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
  line_kind TEXT NOT NULL DEFAULT 'HANG', -- HANG | DV
  service_cost NUMERIC(14, 2),
  line_notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_voucher_items_voucher
  ON public.sales_voucher_items (voucher_id);

COMMENT ON TABLE public.sales_vouchers IS 'Phiếu xuất bán kèm DV — GAS Xuất Bán Hàng (gom theo mã XB)';
COMMENT ON COLUMN public.sales_voucher_items.line_kind IS 'HANG = hàng vật lý, DV = dịch vụ đi kèm';

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
