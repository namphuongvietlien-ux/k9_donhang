CREATE OR REPLACE FUNCTION public.reject_internal_dispatch(_dispatch_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dispatch public.internal_dispatches%ROWTYPE;
BEGIN
  SELECT * INTO v_dispatch
  FROM public.internal_dispatches
  WHERE id = _dispatch_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đơn xuất'; END IF;
  IF NOT public.can_manage_internal_dispatch(v_dispatch.warehouse_id) THEN
    RAISE EXCEPTION 'Không có quyền từ chối đơn này';
  END IF;
  IF v_dispatch.status <> 'pending_manager' THEN
    RAISE EXCEPTION 'Đơn này đã được xử lý';
  END IF;

  UPDATE public.internal_dispatches
  SET status = 'manager_rejected', updated_at = now()
  WHERE id = v_dispatch.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_internal_dispatch(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';