-- Idempotent: mọi tài khoản portal nhập được đơn đề nghị xuất.
-- Có warehouse_id → chỉ đúng chi nhánh mình. Chưa gán CN (HQ) → chọn trên form.

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
      MAX(NULLIF(trim(item->>'notes'), '')) AS notes
    FROM jsonb_array_elements(_items) AS item
    WHERE COALESCE((item->>'quantity')::numeric, 0) > 0
      AND NULLIF(trim(item->>'product_code'), '') IS NOT NULL
    GROUP BY 1, 2, 4
  LOOP
    v_line_no := v_line_no + 1;
    INSERT INTO public.internal_dispatch_items (
      dispatch_id, line_no, product_id, product_code, product_name, unit, quantity, notes
    ) VALUES (
      v_dispatch_id, v_line_no, v_line.product_id, v_line.product_code,
      v_line.product_name, v_line.unit, v_line.quantity, v_line.notes
    );
  END LOOP;

  IF v_line_no = 0 THEN
    RAISE EXCEPTION 'Đơn phải có ít nhất một mặt hàng';
  END IF;
  RETURN v_dispatch_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_internal_dispatch(uuid, text, jsonb) TO authenticated, service_role;
