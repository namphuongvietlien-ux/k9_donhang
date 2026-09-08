-- Khóa STT phiếu kho sau lần in/khóa đầu; quà tặng không trộn DH/DT.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stt_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS printed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.stt_locked_at IS
  'Khóa thứ tự dòng (STT) sau lần in đầu hoặc khi khóa phiếu. Mã thêm sau luôn max(stt)+1.';
COMMENT ON COLUMN public.orders.printed_at IS
  'Thời điểm in phiếu kho lần đầu (DH/DT/DC).';

CREATE INDEX IF NOT EXISTS idx_orders_stt_locked_at
  ON public.orders (stt_locked_at)
  WHERE stt_locked_at IS NOT NULL;

-- Cho phép gán STT lần đầu (NULL → số). Chỉ chặn đổi số đã có.
CREATE OR REPLACE FUNCTION public.prevent_order_item_stt_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stt IS NOT NULL AND OLD.stt IS DISTINCT FROM NEW.stt THEN
    RAISE EXCEPTION 'Không được phép thay đổi STT sau khi đã lưu.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Gán STT còn trống theo thứ tự tạo dòng (không đụng STT đã có).
-- Bỏ phiếu khóa / hoàn thành / hủy — trigger check_order_lock_status chặn UPDATE.
WITH ranked AS (
  SELECT
    oi.id,
    COALESCE((
      SELECT MAX(existing.stt)
      FROM public.order_items existing
      WHERE existing.order_id = oi.order_id
    ), 0) + ROW_NUMBER() OVER (
      PARTITION BY oi.order_id
      ORDER BY oi.created_at ASC NULLS LAST, oi.id ASC
    ) AS rn
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.stt IS NULL
    AND COALESCE(o.is_locked, false) = false
    AND COALESCE(o.status, '') NOT IN ('completed', 'cancelled')
)
UPDATE public.order_items oi
SET stt = ranked.rn
FROM ranked
WHERE oi.id = ranked.id;

CREATE OR REPLACE FUNCTION public.lock_warehouse_order_stt(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = _order_id
      AND COALESCE(is_locked, false) = false
      AND COALESCE(status, '') NOT IN ('completed', 'cancelled')
  ) THEN
    WITH ranked AS (
      SELECT
        oi.id,
        COALESCE((
          SELECT MAX(existing.stt)
          FROM public.order_items existing
          WHERE existing.order_id = _order_id
        ), 0) + ROW_NUMBER() OVER (
          ORDER BY oi.created_at ASC NULLS LAST, oi.id ASC
        ) AS rn
      FROM public.order_items oi
      WHERE oi.order_id = _order_id
        AND oi.stt IS NULL
    )
    UPDATE public.order_items oi
    SET stt = ranked.rn
    FROM ranked
    WHERE oi.id = ranked.id;
  END IF;

  UPDATE public.orders
  SET stt_locked_at = COALESCE(stt_locked_at, now())
  WHERE id = _order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_warehouse_order_stt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lock_warehouse_order_stt(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_warehouse_order_printed(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.lock_warehouse_order_stt(_order_id);
  UPDATE public.orders
  SET printed_at = COALESCE(printed_at, now())
  WHERE id = _order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_warehouse_order_printed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_warehouse_order_printed(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.expand_order_gifts(_order_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_stt integer;
  v_added integer := 0;
  v_main record;
  v_gift record;
  v_gift_qty numeric;
  v_kind text;
  v_gift_is_med boolean;
BEGIN
  SELECT order_kind INTO v_kind FROM public.orders WHERE id = _order_id;
  SELECT COALESCE(max(stt), 0) INTO v_stt FROM public.order_items WHERE order_id = _order_id;

  FOR v_main IN
    SELECT oi.*
    FROM public.order_items oi
    WHERE oi.order_id = _order_id
      AND COALESCE(oi.is_gift, false) = false
  LOOP
    FOR v_gift IN
      SELECT
        g.quantity AS gift_qty,
        p.id, p.slug, p.name, p.unit, p.barcode,
        p.category_group, p.sku_industry
      FROM public.product_gifts g
      JOIN public.products p ON p.id = g.gift_product_id
      JOIN public.products pm ON pm.id = g.main_product_id
      WHERE g.is_active
        AND (
          (v_main.product_id IS NOT NULL AND g.main_product_id = v_main.product_id)
          OR (
            NULLIF(trim(v_main.product_slug), '') IS NOT NULL
            AND upper(trim(pm.slug)) = upper(trim(v_main.product_slug))
          )
        )
    LOOP
      v_gift_is_med :=
        COALESCE(v_gift.category_group, '') = 'THUOC'
        OR COALESCE(v_gift.sku_industry, '') IN ('YT', 'VT');
      IF v_kind = 'DH' AND v_gift_is_med THEN CONTINUE; END IF;
      IF v_kind = 'DT' AND NOT v_gift_is_med THEN CONTINUE; END IF;

      IF EXISTS (
        SELECT 1 FROM public.order_items
        WHERE order_id = _order_id
          AND (
            product_id = v_gift.id
            OR upper(trim(COALESCE(product_slug, ''))) = upper(trim(v_gift.slug))
          )
          AND (
            COALESCE(is_gift, false) = true
            OR COALESCE(line_notes, '') ILIKE '%tặng kèm%'
          )
      ) THEN
        CONTINUE;
      END IF;

      v_gift_qty := ROUND(COALESCE(v_main.quantity, 0) * v_gift.gift_qty, 3);
      IF v_gift_qty <= 0 THEN CONTINUE; END IF;

      v_stt := v_stt + 1;
      INSERT INTO public.order_items (
        order_id, stt, product_id, product_slug, product_name, barcode, unit,
        price, quantity, qty_requested, qty_packed, qty_received,
        shipping_fee, line_notes, is_gift, gift_of_item_id
      ) VALUES (
        _order_id, v_stt, v_gift.id, v_gift.slug, v_gift.name, v_gift.barcode, v_gift.unit,
        0, v_gift_qty, v_gift_qty, NULL, NULL,
        0, 'Hàng tặng kèm', true, v_main.id
      );
      v_added := v_added + 1;
    END LOOP;
  END LOOP;

  RETURN v_added;
END;
$$;

NOTIFY pgrst, 'reload schema';
