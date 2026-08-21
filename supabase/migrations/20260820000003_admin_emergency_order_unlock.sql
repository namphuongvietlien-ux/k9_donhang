CREATE TABLE public.order_unlock_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  unlocked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_unlock_audits_order_created
  ON public.order_unlock_audits (order_id, created_at DESC);

ALTER TABLE public.order_unlock_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins view order unlock audits"
  ON public.order_unlock_audits FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE OR REPLACE FUNCTION public.admin_unlock_order(
  _order_id uuid,
  _reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Chỉ super admin được mở khóa khẩn cấp đơn hàng';
  END IF;
  IF NULLIF(trim(_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Nhập lý do mở khóa';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = _order_id AND is_locked = true) THEN
    RAISE EXCEPTION 'Đơn không tồn tại hoặc chưa bị khóa';
  END IF;

  UPDATE public.orders
  SET is_locked = false,
      locked_at = null,
      updated_at = now()
  WHERE id = _order_id;

  INSERT INTO public.order_unlock_audits (order_id, unlocked_by, reason)
  VALUES (_order_id, auth.uid(), trim(_reason));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_unlock_order(uuid, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
