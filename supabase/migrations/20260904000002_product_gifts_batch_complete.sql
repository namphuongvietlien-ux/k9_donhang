-- 1) Mapping hàng tặng kèm
-- 2) Bulk xác nhận đơn xuất nội bộ đã duyệt
-- 3) Gắn quà + trừ tồn khi tạo phiếu DH/DC (ACID)

CREATE OR REPLACE FUNCTION public.normalize_stock_unit_key(_unit text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(NULLIF(lower(regexp_replace(
    translate(
      lower(trim(COALESCE(_unit, ''))),
      'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ',
      'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
    ),
    '\s+', '', 'g'
  )), ''), 'cai');
$$;

CREATE TABLE IF NOT EXISTS public.product_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  main_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  gift_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric(14,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_gifts_distinct CHECK (main_product_id <> gift_product_id),
  CONSTRAINT product_gifts_main_gift_unique UNIQUE (main_product_id, gift_product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_gifts_main ON public.product_gifts (main_product_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_product_gifts_gift ON public.product_gifts (gift_product_id);

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS is_gift boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gift_of_item_id uuid;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stock_posted_at timestamptz;

ALTER TABLE public.internal_dispatch_items
  ADD COLUMN IF NOT EXISTS is_gift boolean NOT NULL DEFAULT false;

ALTER TABLE public.product_gifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage product gifts" ON public.product_gifts;
CREATE POLICY "Admins manage product gifts"
  ON public.product_gifts FOR ALL
  USING (public.can_access_admin(auth.uid()))
  WITH CHECK (public.can_access_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_gifts TO authenticated;

-- ---------------------------------------------------------------------------
-- Gắn dòng tặng kèm vào phiếu DH/DC (1 cấp, không đệ quy)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expand_order_gifts(_order_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_stt integer;
  v_added integer := 0;
  v_main record;
  v_gift record;
  v_gift_qty numeric;
BEGIN
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
        p.id, p.slug, p.name, p.unit, p.barcode
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
      IF EXISTS (
        SELECT 1 FROM public.order_items
        WHERE order_id = _order_id
          AND COALESCE(is_gift, false) = true
          AND product_slug = v_gift.slug
          AND gift_of_item_id = v_main.id
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

-- ---------------------------------------------------------------------------
-- Trừ tồn kho xuất cho toàn bộ dòng phiếu (kể cả quà). Idempotent qua stock_posted_at.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_order_stock(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order record;
  v_item record;
  v_unit_key text;
  v_stock record;
  v_next numeric;
  v_sum numeric;
  v_wh_code text;
BEGIN
  SELECT id, source_warehouse_id, stock_posted_at, status
  INTO v_order
  FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đơn'; END IF;
  IF v_order.stock_posted_at IS NOT NULL THEN RETURN; END IF;
  IF v_order.status = 'cancelled' THEN RETURN; END IF;
  IF v_order.source_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu kho xuất — không trừ tồn được';
  END IF;

  FOR v_item IN
    SELECT
      oi.quantity, oi.qty_requested, oi.unit, oi.product_id, oi.product_slug
    FROM public.order_items oi
    WHERE oi.order_id = _order_id
  LOOP
    IF COALESCE(v_item.qty_requested, v_item.quantity, 0) <= 0 THEN CONTINUE; END IF;
    IF v_item.product_id IS NULL AND NULLIF(trim(v_item.product_slug), '') IS NOT NULL THEN
      SELECT id INTO v_item.product_id FROM public.products WHERE slug = v_item.product_slug LIMIT 1;
    END IF;
    IF v_item.product_id IS NULL THEN CONTINUE; END IF;

    v_unit_key := public.normalize_stock_unit_key(v_item.unit);

    SELECT id, quantity INTO v_stock
    FROM public.stock_on_hand
    WHERE warehouse_id = v_order.source_warehouse_id
      AND product_id = v_item.product_id
      AND unit_key = v_unit_key
    FOR UPDATE;

    IF NOT FOUND THEN
      SELECT id, quantity INTO v_stock
      FROM public.stock_on_hand
      WHERE warehouse_id = v_order.source_warehouse_id
        AND product_id = v_item.product_id
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
      FOR UPDATE;
    END IF;

    v_next := GREATEST(0, COALESCE(v_stock.quantity, 0) - COALESCE(v_item.qty_requested, v_item.quantity, 0));

    IF v_stock.id IS NOT NULL THEN
      UPDATE public.stock_on_hand
      SET quantity = v_next, updated_at = now()
      WHERE id = v_stock.id;
    ELSE
      INSERT INTO public.stock_on_hand (warehouse_id, product_id, quantity, unit, unit_key)
      VALUES (
        v_order.source_warehouse_id,
        v_item.product_id,
        0,
        COALESCE(NULLIF(trim(v_item.unit), ''), 'cái'),
        v_unit_key
      );
    END IF;

    SELECT code INTO v_wh_code FROM public.warehouses WHERE id = v_order.source_warehouse_id;
    IF v_wh_code = 'Q7' THEN
      SELECT COALESCE(sum(quantity), 0) INTO v_sum
      FROM public.stock_on_hand
      WHERE warehouse_id = v_order.source_warehouse_id AND product_id = v_item.product_id;
      UPDATE public.products SET stock_quantity = GREATEST(0, v_sum) WHERE id = v_item.product_id;
    END IF;
  END LOOP;

  UPDATE public.orders SET stock_posted_at = now(), updated_at = now() WHERE id = _order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_warehouse_order(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gifts integer;
BEGIN
  IF NOT public.can_access_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Không có quyền xử lý đơn kho';
  END IF;
  v_gifts := public.expand_order_gifts(_order_id);
  PERFORM public.deduct_order_stock(_order_id);
  RETURN jsonb_build_object('ok', true, 'gifts_added', v_gifts);
END;
$$;

-- ---------------------------------------------------------------------------
-- Quà tặng trên phiếu xuất nội bộ
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expand_dispatch_gifts(_dispatch_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_line integer;
  v_added integer := 0;
  v_main record;
  v_gift record;
  v_qty numeric;
BEGIN
  SELECT COALESCE(max(line_no), 0) INTO v_line
  FROM public.internal_dispatch_items WHERE dispatch_id = _dispatch_id;

  FOR v_main IN
    SELECT * FROM public.internal_dispatch_items
    WHERE dispatch_id = _dispatch_id AND COALESCE(is_gift, false) = false
  LOOP
    FOR v_gift IN
      SELECT g.quantity AS gift_qty, p.id, p.slug, p.name, p.unit
      FROM public.product_gifts g
      JOIN public.products p ON p.id = g.gift_product_id
      WHERE g.is_active
        AND g.main_product_id = COALESCE(
          v_main.product_id,
          (SELECT id FROM public.products WHERE slug = v_main.product_code LIMIT 1)
        )
    LOOP
      IF EXISTS (
        SELECT 1 FROM public.internal_dispatch_items
        WHERE dispatch_id = _dispatch_id
          AND COALESCE(is_gift, false) = true
          AND product_code = v_gift.slug
      ) THEN
        CONTINUE;
      END IF;
      v_qty := ROUND(COALESCE(v_main.quantity, 0) * v_gift.gift_qty, 3);
      IF v_qty <= 0 THEN CONTINUE; END IF;
      v_line := v_line + 1;
      INSERT INTO public.internal_dispatch_items (
        dispatch_id, line_no, product_id, product_code, product_name, unit, quantity, notes, is_gift
      ) VALUES (
        _dispatch_id, v_line, v_gift.id, v_gift.slug, v_gift.name, v_gift.unit, v_qty, 'Hàng tặng kèm', true
      )
      ON CONFLICT (dispatch_id, product_code, unit)
      DO UPDATE SET quantity = public.internal_dispatch_items.quantity + EXCLUDED.quantity;
      v_added := v_added + 1;
    END LOOP;
  END LOOP;
  RETURN v_added;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_expand_dispatch_gifts_on_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.is_gift, false) THEN RETURN NEW; END IF;
  PERFORM public.expand_dispatch_gifts(NEW.dispatch_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_internal_dispatch_item_expand_gifts ON public.internal_dispatch_items;
CREATE CONSTRAINT TRIGGER trg_internal_dispatch_item_expand_gifts
AFTER INSERT ON public.internal_dispatch_items
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (COALESCE(NEW.is_gift, false) = false)
EXECUTE FUNCTION public.trg_expand_dispatch_gifts_on_item();

-- ---------------------------------------------------------------------------
-- Bulk xác nhận đã xử lý các phiếu XNB được chọn (không phải "tất cả")
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_internal_dispatches(_dispatch_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_internal_dispatch_admin() THEN
    RAISE EXCEPTION 'Chỉ Admin Tổng công ty được xác nhận đã xử lý';
  END IF;
  IF _dispatch_ids IS NULL OR array_length(_dispatch_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Chưa chọn đơn nào';
  END IF;

  UPDATE public.internal_dispatches
  SET
    status = 'processed',
    processed_at = now(),
    processed_by = auth.uid(),
    updated_at = now()
  WHERE id = ANY(_dispatch_ids)
    AND status = 'manager_approved';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.weekly_orders w
  SET
    status = 'processed',
    processed_at = COALESCE(w.processed_at, now()),
    processed_by = COALESCE(w.processed_by, auth.uid()),
    updated_at = now()
  WHERE w.status <> 'processed'
    AND EXISTS (
      SELECT 1 FROM public.weekly_order_dispatches wd
      WHERE wd.weekly_order_id = w.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.weekly_order_dispatches wd
      JOIN public.internal_dispatches d ON d.id = wd.dispatch_id
      WHERE wd.weekly_order_id = w.id
        AND d.status <> 'processed'
        AND d.status <> 'manager_rejected'
    );

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_stock_unit_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expand_order_gifts(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deduct_order_stock(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_warehouse_order(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expand_dispatch_gifts(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_internal_dispatches(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.restore_order_stock(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order record;
  v_item record;
  v_unit_key text;
  v_stock record;
  v_sum numeric;
  v_wh_code text;
  v_qty numeric;
BEGIN
  IF NOT public.can_access_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Không có quyền hoàn tồn';
  END IF;

  SELECT id, source_warehouse_id, stock_posted_at, status
  INTO v_order
  FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đơn'; END IF;
  IF v_order.stock_posted_at IS NULL THEN RETURN; END IF;
  IF v_order.source_warehouse_id IS NULL THEN
    UPDATE public.orders SET stock_posted_at = NULL, updated_at = now() WHERE id = _order_id;
    RETURN;
  END IF;

  FOR v_item IN
    SELECT quantity, qty_requested, unit, product_id, product_slug
    FROM public.order_items
    WHERE order_id = _order_id
  LOOP
    v_qty := COALESCE(v_item.qty_requested, v_item.quantity, 0);
    IF v_qty <= 0 THEN CONTINUE; END IF;
    IF v_item.product_id IS NULL AND NULLIF(trim(v_item.product_slug), '') IS NOT NULL THEN
      SELECT id INTO v_item.product_id FROM public.products WHERE slug = v_item.product_slug LIMIT 1;
    END IF;
    IF v_item.product_id IS NULL THEN CONTINUE; END IF;

    v_unit_key := public.normalize_stock_unit_key(v_item.unit);

    SELECT id, quantity INTO v_stock
    FROM public.stock_on_hand
    WHERE warehouse_id = v_order.source_warehouse_id
      AND product_id = v_item.product_id
      AND unit_key = v_unit_key
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.stock_on_hand (warehouse_id, product_id, quantity, unit, unit_key)
      VALUES (
        v_order.source_warehouse_id,
        v_item.product_id,
        v_qty,
        COALESCE(NULLIF(trim(v_item.unit), ''), 'cái'),
        v_unit_key
      );
    ELSE
      UPDATE public.stock_on_hand
      SET quantity = COALESCE(v_stock.quantity, 0) + v_qty, updated_at = now()
      WHERE id = v_stock.id;
    END IF;

    SELECT code INTO v_wh_code FROM public.warehouses WHERE id = v_order.source_warehouse_id;
    IF v_wh_code = 'Q7' THEN
      SELECT COALESCE(sum(quantity), 0) INTO v_sum
      FROM public.stock_on_hand
      WHERE warehouse_id = v_order.source_warehouse_id AND product_id = v_item.product_id;
      UPDATE public.products SET stock_quantity = GREATEST(0, v_sum) WHERE id = v_item.product_id;
    END IF;
  END LOOP;

  UPDATE public.orders SET stock_posted_at = NULL, updated_at = now() WHERE id = _order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_order_stock(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
