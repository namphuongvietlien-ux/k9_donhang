-- Chế độ hàng tặng: dài hạn | timeline (ngày VN) | giới hạn tổng SL tặng.

ALTER TABLE public.product_gifts
  ADD COLUMN IF NOT EXISTS limit_kind text NOT NULL DEFAULT 'long_term',
  ADD COLUMN IF NOT EXISTS starts_on date,
  ADD COLUMN IF NOT EXISTS ends_on date,
  ADD COLUMN IF NOT EXISTS max_total_qty numeric(14,3),
  ADD COLUMN IF NOT EXISTS used_qty numeric(14,3) NOT NULL DEFAULT 0;

UPDATE public.product_gifts
SET limit_kind = 'long_term'
WHERE limit_kind IS NULL OR limit_kind NOT IN ('long_term', 'timeline', 'qty_limit');

ALTER TABLE public.product_gifts
  DROP CONSTRAINT IF EXISTS product_gifts_limit_kind_check;
ALTER TABLE public.product_gifts
  ADD CONSTRAINT product_gifts_limit_kind_check
  CHECK (limit_kind IN ('long_term', 'timeline', 'qty_limit'));

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS gift_rule_id uuid REFERENCES public.product_gifts(id) ON DELETE SET NULL;

ALTER TABLE public.internal_dispatch_items
  ADD COLUMN IF NOT EXISTS gift_rule_id uuid REFERENCES public.product_gifts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_gift_rule
  ON public.order_items (gift_rule_id) WHERE gift_rule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dispatch_items_gift_rule
  ON public.internal_dispatch_items (gift_rule_id) WHERE gift_rule_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.gift_rule_is_live(
  _is_active boolean,
  _limit_kind text,
  _starts_on date,
  _ends_on date,
  _max_total_qty numeric,
  _used_qty numeric
) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(_is_active, false)
    AND CASE COALESCE(_limit_kind, 'long_term')
      WHEN 'timeline' THEN
        (_starts_on IS NULL OR (timezone('Asia/Ho_Chi_Minh', now()))::date >= _starts_on)
        AND (_ends_on IS NULL OR (timezone('Asia/Ho_Chi_Minh', now()))::date <= _ends_on)
      WHEN 'qty_limit' THEN
        _max_total_qty IS NULL OR COALESCE(_used_qty, 0) < _max_total_qty
      ELSE true
    END;
$$;

CREATE OR REPLACE FUNCTION public.trg_apply_gift_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g record;
  v_remain numeric;
BEGIN
  IF NOT COALESCE(NEW.is_gift, false) OR NEW.gift_rule_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO g FROM public.product_gifts WHERE id = NEW.gift_rule_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NOT public.gift_rule_is_live(
    g.is_active, g.limit_kind, g.starts_on, g.ends_on, g.max_total_qty, g.used_qty
  ) THEN
    RETURN NULL;
  END IF;

  IF COALESCE(g.limit_kind, 'long_term') = 'qty_limit' AND g.max_total_qty IS NOT NULL THEN
    v_remain := GREATEST(0, g.max_total_qty - COALESCE(g.used_qty, 0));
    IF v_remain <= 0 THEN RETURN NULL; END IF;
    IF COALESCE(NEW.quantity, 0) > v_remain THEN
      NEW.quantity := v_remain;
      IF TG_TABLE_NAME = 'order_items' THEN
        NEW.qty_requested := v_remain;
      END IF;
    END IF;
    UPDATE public.product_gifts
    SET used_qty = COALESCE(used_qty, 0) + NEW.quantity, updated_at = now()
    WHERE id = g.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_item_gift_quota ON public.order_items;
CREATE TRIGGER trg_order_item_gift_quota
BEFORE INSERT ON public.order_items
FOR EACH ROW
WHEN (COALESCE(NEW.is_gift, false) = true)
EXECUTE FUNCTION public.trg_apply_gift_quota();

DROP TRIGGER IF EXISTS trg_dispatch_item_gift_quota ON public.internal_dispatch_items;
CREATE TRIGGER trg_dispatch_item_gift_quota
BEFORE INSERT ON public.internal_dispatch_items
FOR EACH ROW
WHEN (COALESCE(NEW.is_gift, false) = true)
EXECUTE FUNCTION public.trg_apply_gift_quota();

CREATE OR REPLACE FUNCTION public.release_order_gift_quota(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.product_gifts g
  SET
    used_qty = GREATEST(0, COALESCE(g.used_qty, 0) - x.qty),
    updated_at = now()
  FROM (
    SELECT gift_rule_id, SUM(COALESCE(quantity, 0)) AS qty
    FROM public.order_items
    WHERE order_id = _order_id
      AND COALESCE(is_gift, false)
      AND gift_rule_id IS NOT NULL
    GROUP BY 1
  ) x
  WHERE g.id = x.gift_rule_id
    AND COALESCE(g.limit_kind, 'long_term') = 'qty_limit';
END;
$$;

CREATE OR REPLACE FUNCTION public.release_dispatch_gift_quota(_dispatch_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.product_gifts g
  SET
    used_qty = GREATEST(0, COALESCE(g.used_qty, 0) - x.qty),
    updated_at = now()
  FROM (
    SELECT gift_rule_id, SUM(COALESCE(quantity, 0)) AS qty
    FROM public.internal_dispatch_items
    WHERE dispatch_id = _dispatch_id
      AND COALESCE(is_gift, false)
      AND gift_rule_id IS NOT NULL
    GROUP BY 1
  ) x
  WHERE g.id = x.gift_rule_id
    AND COALESCE(g.limit_kind, 'long_term') = 'qty_limit';
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_release_gift_quota_on_order_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.release_order_gift_quota(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_release_gift_quota ON public.orders;
CREATE TRIGGER trg_orders_release_gift_quota
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
EXECUTE FUNCTION public.trg_release_gift_quota_on_order_cancel();

CREATE OR REPLACE FUNCTION public.trg_release_gift_quota_on_dispatch_reject()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.release_dispatch_gift_quota(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatches_release_gift_quota ON public.internal_dispatches;
CREATE TRIGGER trg_dispatches_release_gift_quota
AFTER UPDATE OF status ON public.internal_dispatches
FOR EACH ROW
WHEN (NEW.status = 'manager_rejected' AND OLD.status IS DISTINCT FROM 'manager_rejected')
EXECUTE FUNCTION public.trg_release_gift_quota_on_dispatch_reject();

CREATE OR REPLACE FUNCTION public.expand_order_gifts(_order_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_stt integer;
  v_added integer := 0;
  v_main record;
  v_gift record;
  v_gift_qty numeric;
  v_remain numeric;
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
        g.id AS rule_id,
        g.quantity AS gift_qty,
        g.limit_kind,
        g.max_total_qty,
        g.used_qty,
        p.id, p.slug, p.name, p.unit, p.barcode
      FROM public.product_gifts g
      JOIN public.products p ON p.id = g.gift_product_id
      JOIN public.products pm ON pm.id = g.main_product_id
      WHERE public.gift_rule_is_live(
          g.is_active, g.limit_kind, g.starts_on, g.ends_on, g.max_total_qty, g.used_qty
        )
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
      IF COALESCE(v_gift.limit_kind, 'long_term') = 'qty_limit' AND v_gift.max_total_qty IS NOT NULL THEN
        v_remain := GREATEST(0, v_gift.max_total_qty - COALESCE(v_gift.used_qty, 0));
        v_gift_qty := LEAST(v_gift_qty, v_remain);
      END IF;
      IF v_gift_qty <= 0 THEN CONTINUE; END IF;

      v_stt := v_stt + 1;
      INSERT INTO public.order_items (
        order_id, stt, product_id, product_slug, product_name, barcode, unit,
        price, quantity, qty_requested, qty_packed, qty_received,
        shipping_fee, line_notes, is_gift, gift_of_item_id, gift_rule_id
      ) VALUES (
        _order_id, v_stt, v_gift.id, v_gift.slug, v_gift.name, v_gift.barcode, v_gift.unit,
        0, v_gift_qty, v_gift_qty, NULL, NULL,
        0, 'Hàng tặng kèm', true, v_main.id, v_gift.rule_id
      );
      v_added := v_added + 1;
    END LOOP;
  END LOOP;

  RETURN v_added;
END;
$$;

CREATE OR REPLACE FUNCTION public.expand_dispatch_gifts(_dispatch_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_line integer;
  v_added integer := 0;
  v_main record;
  v_gift record;
  v_qty numeric;
  v_remain numeric;
BEGIN
  SELECT COALESCE(max(line_no), 0) INTO v_line
  FROM public.internal_dispatch_items WHERE dispatch_id = _dispatch_id;

  FOR v_main IN
    SELECT * FROM public.internal_dispatch_items
    WHERE dispatch_id = _dispatch_id AND COALESCE(is_gift, false) = false
  LOOP
    FOR v_gift IN
      SELECT
        g.id AS rule_id,
        g.quantity AS gift_qty,
        g.limit_kind,
        g.max_total_qty,
        g.used_qty,
        p.id, p.slug, p.name, p.unit
      FROM public.product_gifts g
      JOIN public.products p ON p.id = g.gift_product_id
      JOIN public.products pm ON pm.id = g.main_product_id
      WHERE public.gift_rule_is_live(
          g.is_active, g.limit_kind, g.starts_on, g.ends_on, g.max_total_qty, g.used_qty
        )
        AND (
          (v_main.product_id IS NOT NULL AND g.main_product_id = v_main.product_id)
          OR (
            NULLIF(trim(v_main.product_code), '') IS NOT NULL
            AND upper(trim(pm.slug)) = upper(trim(v_main.product_code))
          )
        )
    LOOP
      IF EXISTS (
        SELECT 1 FROM public.internal_dispatch_items
        WHERE dispatch_id = _dispatch_id
          AND (
            product_id = v_gift.id
            OR upper(trim(COALESCE(product_code, ''))) = upper(trim(v_gift.slug))
          )
      ) THEN
        CONTINUE;
      END IF;
      v_qty := ROUND(COALESCE(v_main.quantity, 0) * v_gift.gift_qty, 3);
      IF COALESCE(v_gift.limit_kind, 'long_term') = 'qty_limit' AND v_gift.max_total_qty IS NOT NULL THEN
        v_remain := GREATEST(0, v_gift.max_total_qty - COALESCE(v_gift.used_qty, 0));
        v_qty := LEAST(v_qty, v_remain);
      END IF;
      IF v_qty <= 0 THEN CONTINUE; END IF;
      v_line := v_line + 1;
      INSERT INTO public.internal_dispatch_items (
        dispatch_id, line_no, product_id, product_code, product_name, unit, quantity, notes, is_gift, gift_rule_id
      ) VALUES (
        _dispatch_id, v_line, v_gift.id, v_gift.slug, v_gift.name, v_gift.unit, v_qty, 'Hàng tặng kèm', true, v_gift.rule_id
      )
      ON CONFLICT (dispatch_id, product_code, unit)
      DO UPDATE SET
        quantity = public.internal_dispatch_items.quantity + EXCLUDED.quantity,
        notes = COALESCE(public.internal_dispatch_items.notes, EXCLUDED.notes);
      v_added := v_added + 1;
    END LOOP;
  END LOOP;
  RETURN v_added;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_internal_dispatch(
  _warehouse_id uuid,
  _notes text,
  _items jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dispatch_id uuid;
  v_line record;
  v_line_no integer := 0;
BEGIN
  IF NOT public.can_access_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Không có quyền tạo đơn xuất nội bộ';
  END IF;

  IF NOT public.is_internal_dispatch_admin()
     AND EXISTS (
       SELECT 1 FROM public.profiles
       WHERE user_id = auth.uid() AND warehouse_id IS NOT NULL
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE user_id = auth.uid() AND warehouse_id = _warehouse_id
     ) THEN
    RAISE EXCEPTION 'Bạn không thuộc chi nhánh này';
  END IF;

  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Đơn phải có ít nhất một mặt hàng';
  END IF;

  INSERT INTO public.internal_dispatches (dispatch_code, warehouse_id, notes)
  VALUES (
    'XNB-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)),
    _warehouse_id,
    _notes
  )
  RETURNING id INTO v_dispatch_id;

  FOR v_line IN
    SELECT
      CASE
        WHEN (item->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (item->>'product_id')::uuid
        ELSE NULL
      END AS product_id,
      trim(item->>'product_code') AS product_code,
      MAX(trim(item->>'product_name')) AS product_name,
      NULLIF(trim(item->>'unit'), '') AS unit,
      SUM(COALESCE((item->>'quantity')::numeric, 0)) AS quantity,
      MAX(NULLIF(trim(item->>'notes'), '')) AS notes,
      bool_or(COALESCE(item->>'is_gift', '') IN ('true', 't', '1')) AS is_gift,
      CASE
        WHEN (item->>'gift_rule_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (item->>'gift_rule_id')::uuid
        ELSE NULL
      END AS gift_rule_id
    FROM jsonb_array_elements(_items) AS item
    WHERE COALESCE((item->>'quantity')::numeric, 0) > 0
      AND NULLIF(trim(item->>'product_code'), '') IS NOT NULL
    GROUP BY 1, 2, 4, 8
  LOOP
    v_line_no := v_line_no + 1;
    INSERT INTO public.internal_dispatch_items (
      dispatch_id, line_no, product_id, product_code, product_name, unit, quantity, notes, is_gift, gift_rule_id
    ) VALUES (
      v_dispatch_id, v_line_no, v_line.product_id, v_line.product_code,
      v_line.product_name, v_line.unit, v_line.quantity, v_line.notes,
      COALESCE(v_line.is_gift, false), v_line.gift_rule_id
    );
  END LOOP;

  IF v_line_no = 0 THEN
    RAISE EXCEPTION 'Đơn phải có ít nhất một mặt hàng';
  END IF;
  RETURN v_dispatch_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gift_rule_is_live(boolean, text, date, date, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expand_order_gifts(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expand_dispatch_gifts(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_internal_dispatch(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_order_gift_quota(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_dispatch_gift_quota(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
