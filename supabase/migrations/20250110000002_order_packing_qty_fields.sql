-- Phase 1 Hub phiếu DH/DC (GAS): packing qty + order_kind + đảm bảo kho xuất/nhận

-- 1) orders: kho xuất / kho nhận (idempotent — có thể đã có từ migration trước)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.orders.warehouse_id IS 'Kho nhận (chi nhánh) — GAS: khoNhan';
COMMENT ON COLUMN public.orders.source_warehouse_id IS 'Kho xuất / soạn — GAS: khoXuat (DH khóa Q7)';

CREATE INDEX IF NOT EXISTS idx_orders_source_warehouse ON public.orders(source_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_orders_warehouse_id ON public.orders(warehouse_id);

-- 2) order_kind: chỉ DH | DC | NULL (theo PRD Phase 1)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_kind TEXT;

COMMENT ON COLUMN public.orders.order_kind IS 'DH=Đơn hàng nội bộ (xuất Q7), DC=Điều chuyển';

UPDATE public.orders
SET order_kind = CASE
  WHEN order_code ILIKE 'DH-%' THEN 'DH'
  WHEN order_code ILIKE 'DC-%' THEN 'DC'
  WHEN order_kind IN ('DH', 'DC') THEN order_kind
  ELSE NULL
END
WHERE order_kind IS NULL
   OR order_kind NOT IN ('DH', 'DC');

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_kind_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_kind_check
  CHECK (order_kind IS NULL OR order_kind IN ('DH', 'DC'));

CREATE INDEX IF NOT EXISTS idx_orders_order_kind ON public.orders(order_kind);
CREATE INDEX IF NOT EXISTS idx_orders_status_kind ON public.orders(status, order_kind);

-- 3) order_items: SL yêu cầu / soạn / nhận (GAS col H/I + nhận)
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS qty_requested INTEGER,
  ADD COLUMN IF NOT EXISTS qty_packed INTEGER,
  ADD COLUMN IF NOT EXISTS qty_received INTEGER;

COMMENT ON COLUMN public.order_items.qty_requested IS 'SL yêu cầu gốc (GAS)';
COMMENT ON COLUMN public.order_items.qty_packed IS 'SL thực tế kho xuất đã soạn';
COMMENT ON COLUMN public.order_items.qty_received IS 'SL thực tế kho nhận đã nhận';

-- Backfill: giữ data cũ — quantity → qty_requested
UPDATE public.order_items
SET qty_requested = COALESCE(qty_requested, quantity, 0)
WHERE qty_requested IS NULL;

ALTER TABLE public.order_items
  ALTER COLUMN qty_requested SET DEFAULT 0;

UPDATE public.order_items
SET qty_requested = 0
WHERE qty_requested IS NULL;

-- 4) RLS: admin cập nhật / xóa order_items (soạn hàng, nhận hàng, sửa phiếu)
DROP POLICY IF EXISTS "Order items update policy" ON public.order_items;
CREATE POLICY "Order items update policy"
ON public.order_items
FOR UPDATE
USING (
  public.can_access_admin((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.user_id = (select auth.uid())
  )
)
WITH CHECK (
  public.can_access_admin((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.user_id = (select auth.uid())
  )
);

DROP POLICY IF EXISTS "Order items delete policy" ON public.order_items;
CREATE POLICY "Order items delete policy"
ON public.order_items
FOR DELETE
USING (
  public.can_access_admin((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.user_id = (select auth.uid())
  )
);

NOTIFY pgrst, 'reload schema';
