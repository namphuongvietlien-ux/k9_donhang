-- XB: tổng tiền phiếu + trạng thái hủy/khôi phục
ALTER TABLE public.sales_vouchers
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.sales_vouchers.total_amount IS 'Tổng thành tiền (HÀNG + DV)';
COMMENT ON COLUMN public.sales_vouchers.status IS 'saved | cancelled';

CREATE INDEX IF NOT EXISTS idx_sales_vouchers_status
  ON public.sales_vouchers (status);

NOTIFY pgrst, 'reload schema';
