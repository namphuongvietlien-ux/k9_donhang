-- Debug/hotfix: hoàn tồn khi hủy phiếu đã trừ lúc tạo đơn.

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
