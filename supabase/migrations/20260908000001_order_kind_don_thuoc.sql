-- Cho phép order_kind = DT (đơn thuốc, mã DT-******).
-- DH = đơn hàng, DT = đơn thuốc, DC = điều chuyển.

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_kind_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_kind_check
  CHECK (order_kind IS NULL OR order_kind IN ('DH', 'DT', 'DC'));

COMMENT ON COLUMN public.orders.order_kind IS
  'DH=đơn hàng nội bộ (xuất Q7); DT=đơn thuốc nội bộ (xuất Q7); DC=điều chuyển';

NOTIFY pgrst, 'reload schema';
