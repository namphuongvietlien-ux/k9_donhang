-- =====================================================
-- Multi-warehouse packing: warehouses + stock_on_hand
-- + packing fields on orders
-- =====================================================

-- 1. Warehouses (chi nhánh / mã kho)
CREATE TABLE IF NOT EXISTS public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.warehouses IS 'Mã kho / chi nhánh soạn hàng (Q7, Q8, PH...)';

-- 2. Stock on hand per warehouse + product
CREATE TABLE IF NOT EXISTS public.stock_on_hand (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_on_hand_warehouse ON public.stock_on_hand(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_on_hand_product ON public.stock_on_hand(product_id);

COMMENT ON TABLE public.stock_on_hand IS 'Tồn kho thực tế theo từng mã kho — tách biệt tuyệt đối với số lượng đặt';
COMMENT ON COLUMN public.stock_on_hand.quantity IS 'Tồn thực tế tại kho; không dùng chung với số lượng đặt hàng';

-- 3. Packing / duplicate fields on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS packing_date DATE;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS packing_shift TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS duplicate_accepted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS duplicate_of_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_packing_shift_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_packing_shift_check
      CHECK (packing_shift IS NULL OR packing_shift IN ('main', 'supplement'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_warehouse_id ON public.orders(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_orders_packing_date ON public.orders(packing_date);
CREATE INDEX IF NOT EXISTS idx_orders_packing_shift ON public.orders(packing_shift);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at);

COMMENT ON COLUMN public.orders.packing_shift IS 'main = ca chính (10:00 hôm trước → 08:00 hôm nay); supplement = ca bổ sung (08:00 → 10:00)';

-- 4. Seed default warehouses
INSERT INTO public.warehouses (code, name, sort_order)
VALUES
  ('Q7', 'Kho Quận 7', 1),
  ('Q8', 'Kho Quận 8', 2),
  ('PH', 'Kho Phú Mỹ Hưng', 3)
ON CONFLICT (code) DO NOTHING;

-- 5. Seed stock_on_hand: map products.stock_quantity → kho Q7 mặc định
INSERT INTO public.stock_on_hand (warehouse_id, product_id, quantity)
SELECT w.id, p.id, GREATEST(COALESCE(p.stock_quantity, 0), 0)
FROM public.products p
CROSS JOIN public.warehouses w
WHERE w.code = 'Q7'
ON CONFLICT (warehouse_id, product_id) DO UPDATE
SET quantity = EXCLUDED.quantity,
    updated_at = now();

-- 6. RLS
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_on_hand ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage warehouses" ON public.warehouses;
CREATE POLICY "Admins can manage warehouses"
ON public.warehouses
FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Authenticated can read warehouses" ON public.warehouses;
CREATE POLICY "Authenticated can read warehouses"
ON public.warehouses
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage stock_on_hand" ON public.stock_on_hand;
CREATE POLICY "Admins can manage stock_on_hand"
ON public.stock_on_hand
FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Authenticated can read stock_on_hand" ON public.stock_on_hand;
CREATE POLICY "Authenticated can read stock_on_hand"
ON public.stock_on_hand
FOR SELECT
USING (auth.role() = 'authenticated');
