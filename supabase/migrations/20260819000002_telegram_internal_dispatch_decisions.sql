CREATE OR REPLACE FUNCTION public.telegram_decide_internal_dispatch(
  _dispatch_id uuid,
  _manager_user_id uuid,
  _approved boolean
) RETURNS TABLE (decision_status text, dispatch_code text, requested_by uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dispatch public.internal_dispatches%ROWTYPE;
  v_weekly_id uuid;
  v_item record;
  v_next_line integer;
BEGIN
  SELECT * INTO v_dispatch
  FROM public.internal_dispatches
  WHERE id = _dispatch_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đơn xuất'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.branch_manager_scopes
    WHERE manager_user_id = _manager_user_id
      AND warehouse_id = v_dispatch.warehouse_id
  ) THEN
    RAISE EXCEPTION 'Tài khoản Telegram không có quyền duyệt đơn này';
  END IF;
  IF v_dispatch.status <> 'pending_manager' THEN
    RAISE EXCEPTION 'Đơn này đã được xử lý';
  END IF;

  IF NOT _approved THEN
    UPDATE public.internal_dispatches
    SET status = 'manager_rejected', updated_at = now()
    WHERE id = v_dispatch.id;
    RETURN QUERY SELECT 'manager_rejected'::text, v_dispatch.dispatch_code, v_dispatch.requested_by;
    RETURN;
  END IF;

  INSERT INTO public.weekly_orders (week_start)
  VALUES (date_trunc('week', current_date)::date)
  ON CONFLICT (week_start) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_weekly_id;

  INSERT INTO public.weekly_order_dispatches (weekly_order_id, dispatch_id)
  VALUES (v_weekly_id, v_dispatch.id);

  FOR v_item IN
    SELECT * FROM public.internal_dispatch_items
    WHERE dispatch_id = v_dispatch.id
    ORDER BY line_no
  LOOP
    SELECT COALESCE(MAX(line_no), 0) + 1 INTO v_next_line
    FROM public.weekly_order_items
    WHERE weekly_order_id = v_weekly_id;
    INSERT INTO public.weekly_order_items (
      weekly_order_id, line_no, product_id, product_code, product_name, unit, quantity
    ) VALUES (
      v_weekly_id, v_next_line, v_item.product_id, v_item.product_code,
      v_item.product_name, v_item.unit, v_item.quantity
    ) ON CONFLICT (weekly_order_id, product_code, unit)
    DO UPDATE SET quantity = weekly_order_items.quantity + EXCLUDED.quantity,
                  updated_at = now();
  END LOOP;

  UPDATE public.internal_dispatches
  SET status = 'manager_approved',
      manager_approved_at = now(),
      manager_approved_by = _manager_user_id,
      updated_at = now()
  WHERE id = v_dispatch.id;

  RETURN QUERY SELECT 'manager_approved'::text, v_dispatch.dispatch_code, v_dispatch.requested_by;
END;
$$;

REVOKE ALL ON FUNCTION public.telegram_decide_internal_dispatch(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.telegram_decide_internal_dispatch(uuid, uuid, boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
