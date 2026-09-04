-- Chạy trên Supabase SQL Editor nếu CLI chưa apply migration 20260904000003.
-- Gắn quà theo slug + trigger khi insert dòng phiếu.

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

CREATE OR REPLACE FUNCTION public.trg_expand_order_gifts_on_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.is_gift, false) THEN RETURN NEW; END IF;
  PERFORM public.expand_order_gifts(NEW.order_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_item_expand_gifts ON public.order_items;
CREATE CONSTRAINT TRIGGER trg_order_item_expand_gifts
AFTER INSERT ON public.order_items
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (COALESCE(NEW.is_gift, false) = false)
EXECUTE FUNCTION public.trg_expand_order_gifts_on_item();

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
      JOIN public.products pm ON pm.id = g.main_product_id
      WHERE g.is_active
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
      IF v_qty <= 0 THEN CONTINUE; END IF;
      v_line := v_line + 1;
      INSERT INTO public.internal_dispatch_items (
        dispatch_id, line_no, product_id, product_code, product_name, unit, quantity, notes, is_gift
      ) VALUES (
        _dispatch_id, v_line, v_gift.id, v_gift.slug, v_gift.name, v_gift.unit, v_qty, 'Hàng tặng kèm', true
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

GRANT EXECUTE ON FUNCTION public.expand_order_gifts(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expand_dispatch_gifts(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
