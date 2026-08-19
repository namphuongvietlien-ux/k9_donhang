ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.orders.is_locked IS
  'Admin đã khóa đơn sau khi in; không cho thay đổi nội dung đơn.';

CREATE INDEX IF NOT EXISTS idx_orders_locked
  ON public.orders (is_locked)
  WHERE is_locked = TRUE;

CREATE OR REPLACE FUNCTION public.prevent_locked_order_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_locked
    AND NOT public.can_access_admin((select auth.uid()))
    AND (to_jsonb(NEW) - ARRAY['is_locked', 'locked_at', 'updated_at'])
      IS DISTINCT FROM
      (to_jsonb(OLD) - ARRAY['is_locked', 'locked_at', 'updated_at']) THEN
    RAISE EXCEPTION 'Đơn đã bị khóa. Hãy tạo đơn mới.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_order_changes ON public.orders;
CREATE TRIGGER trg_prevent_locked_order_changes
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_locked_order_changes();

CREATE OR REPLACE FUNCTION public.prevent_locked_order_item_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
  ELSE
    v_order_id := NEW.order_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orders
    WHERE id = v_order_id
      AND is_locked = TRUE
      AND NOT public.can_access_admin((select auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Đơn đã bị khóa. Hãy tạo đơn mới.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_order_item_changes ON public.order_items;
CREATE TRIGGER trg_prevent_locked_order_item_changes
  BEFORE INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_locked_order_item_changes();

DROP FUNCTION IF EXISTS public.lookup_guest_order(TEXT, TEXT);
CREATE FUNCTION public.lookup_guest_order(
  p_order_code TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  order_code TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  shipping_province TEXT,
  subtotal DECIMAL(12, 0),
  shipping_fee DECIMAL(12, 0),
  is_free_shipping BOOLEAN,
  total_amount DECIMAL(12, 0),
  status TEXT,
  is_locked BOOLEAN,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (p_order_code IS NULL OR p_order_code = '')
    AND (p_customer_phone IS NULL OR p_customer_phone = '') THEN
    RAISE EXCEPTION 'Vui lòng nhập mã đơn hàng hoặc số điện thoại';
  END IF;

  RETURN QUERY
  SELECT
    o.id, o.order_code, o.customer_name, o.customer_phone,
    o.customer_address, o.shipping_province, o.subtotal, o.shipping_fee,
    o.is_free_shipping, o.total_amount, o.status, o.is_locked, o.notes,
    o.created_at, o.updated_at
  FROM public.orders o
  WHERE (
    (p_order_code IS NOT NULL AND p_order_code <> '' AND o.order_code = p_order_code)
    OR (
      (p_order_code IS NULL OR p_order_code = '')
      AND p_customer_phone IS NOT NULL AND p_customer_phone <> ''
      AND o.customer_phone = p_customer_phone
    )
  )
  AND (
    (
      p_order_code IS NOT NULL AND p_order_code <> ''
      AND p_customer_phone IS NOT NULL AND p_customer_phone <> ''
      AND o.customer_phone = p_customer_phone
    )
    OR p_customer_phone IS NULL OR p_customer_phone = ''
    OR p_order_code IS NULL OR p_order_code = ''
  )
  ORDER BY o.created_at DESC;
END;
$$;