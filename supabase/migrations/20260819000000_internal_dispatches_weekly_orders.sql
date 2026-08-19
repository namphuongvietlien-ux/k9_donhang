-- Internal branch dispatches and weekly head-office preparation orders.
-- Apply with: supabase db push

CREATE TYPE public.internal_dispatch_status AS ENUM (
  'pending_manager', 'manager_approved', 'manager_rejected', 'processed'
);

CREATE TYPE public.weekly_order_status AS ENUM ('open', 'printed', 'processed');

CREATE TABLE public.branch_manager_scopes (
  manager_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (manager_user_id, warehouse_id)
);

CREATE TABLE public.internal_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_code text NOT NULL UNIQUE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  status public.internal_dispatch_status NOT NULL DEFAULT 'pending_manager',
  requested_at timestamptz NOT NULL DEFAULT now(),
  manager_approved_at timestamptz,
  manager_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_at timestamptz,
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_dispatches_manager_approval_check CHECK (
    (status IN ('manager_approved', 'processed') AND manager_approved_at IS NOT NULL AND manager_approved_by IS NOT NULL)
    OR status IN ('pending_manager', 'manager_rejected')
  ),
  CONSTRAINT internal_dispatches_processed_check CHECK (
    (status = 'processed' AND processed_at IS NOT NULL AND processed_by IS NOT NULL)
    OR status <> 'processed'
  )
);

CREATE TABLE public.internal_dispatch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.internal_dispatches(id) ON DELETE CASCADE,
  line_no integer NOT NULL CHECK (line_no > 0),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_code text NOT NULL,
  product_name text NOT NULL,
  unit text,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dispatch_id, line_no),
  UNIQUE (dispatch_id, product_code, unit)
);

CREATE TABLE public.weekly_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  status public.weekly_order_status NOT NULL DEFAULT 'open',
  printed_at timestamptz,
  printed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_at timestamptz,
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_start),
  CONSTRAINT weekly_orders_week_starts_monday CHECK (extract(isodow FROM week_start) = 1),
  CONSTRAINT weekly_orders_printed_check CHECK ((status IN ('printed', 'processed') AND printed_at IS NOT NULL) OR status = 'open'),
  CONSTRAINT weekly_orders_processed_check CHECK ((status = 'processed' AND processed_at IS NOT NULL AND processed_by IS NOT NULL) OR status <> 'processed')
);

CREATE TABLE public.weekly_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_order_id uuid NOT NULL REFERENCES public.weekly_orders(id) ON DELETE CASCADE,
  line_no integer NOT NULL CHECK (line_no > 0),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_code text NOT NULL,
  product_name text NOT NULL,
  unit text,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (weekly_order_id, line_no),
  UNIQUE NULLS NOT DISTINCT (weekly_order_id, product_code, unit)
);

CREATE TABLE public.weekly_order_dispatches (
  weekly_order_id uuid NOT NULL REFERENCES public.weekly_orders(id) ON DELETE CASCADE,
  dispatch_id uuid NOT NULL UNIQUE REFERENCES public.internal_dispatches(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (weekly_order_id, dispatch_id)
);

CREATE INDEX idx_internal_dispatches_warehouse_status_requested ON public.internal_dispatches (warehouse_id, status, requested_at DESC);
CREATE INDEX idx_internal_dispatches_status_requested ON public.internal_dispatches (status, requested_at DESC);
CREATE INDEX idx_internal_dispatch_items_dispatch_line ON public.internal_dispatch_items (dispatch_id, line_no);
CREATE INDEX idx_weekly_orders_status_week ON public.weekly_orders (status, week_start DESC);
CREATE INDEX idx_weekly_order_items_week_line ON public.weekly_order_items (weekly_order_id, line_no);
CREATE INDEX idx_weekly_order_dispatches_dispatch ON public.weekly_order_dispatches (dispatch_id);

CREATE OR REPLACE FUNCTION public.is_internal_dispatch_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin'::app_role, 'admin'::app_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_internal_dispatch(_warehouse_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_internal_dispatch_admin()
    OR EXISTS (
      SELECT 1 FROM public.branch_manager_scopes
      WHERE manager_user_id = auth.uid() AND warehouse_id = _warehouse_id
    );
$$;

CREATE OR REPLACE FUNCTION public.create_internal_dispatch(
  _warehouse_id uuid,
  _notes text,
  _items jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dispatch_id uuid;
  v_line jsonb;
  v_line_no integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND warehouse_id = _warehouse_id)
     AND NOT public.is_internal_dispatch_admin() THEN
    RAISE EXCEPTION 'Bạn không thuộc chi nhánh này';
  END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Đơn phải có ít nhất một mặt hàng';
  END IF;

  INSERT INTO public.internal_dispatches (dispatch_code, warehouse_id, notes)
  VALUES ('XNB-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)), _warehouse_id, _notes)
  RETURNING id INTO v_dispatch_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(_items) LOOP
    v_line_no := v_line_no + 1;
    INSERT INTO public.internal_dispatch_items (dispatch_id, line_no, product_id, product_code, product_name, unit, quantity, notes)
    VALUES (
      v_dispatch_id, v_line_no, NULLIF(v_line->>'product_id', '')::uuid,
      trim(v_line->>'product_code'), trim(v_line->>'product_name'), NULLIF(trim(v_line->>'unit'), ''),
      (v_line->>'quantity')::numeric, NULLIF(trim(v_line->>'notes'), '')
    );
  END LOOP;
  RETURN v_dispatch_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_internal_dispatch(_dispatch_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dispatch public.internal_dispatches%ROWTYPE;
  v_weekly_id uuid;
  v_item record;
  v_next_line integer;
BEGIN
  SELECT * INTO v_dispatch FROM public.internal_dispatches WHERE id = _dispatch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đơn xuất'; END IF;
  IF NOT public.can_manage_internal_dispatch(v_dispatch.warehouse_id) THEN RAISE EXCEPTION 'Không có quyền duyệt đơn này'; END IF;
  IF v_dispatch.status <> 'pending_manager' THEN RETURN NULL; END IF;

  INSERT INTO public.weekly_orders (week_start)
  VALUES (date_trunc('week', current_date)::date)
  ON CONFLICT (week_start) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_weekly_id;

  INSERT INTO public.weekly_order_dispatches (weekly_order_id, dispatch_id)
  VALUES (v_weekly_id, _dispatch_id);

  FOR v_item IN SELECT * FROM public.internal_dispatch_items WHERE dispatch_id = _dispatch_id ORDER BY line_no LOOP
    SELECT COALESCE(max(line_no), 0) + 1 INTO v_next_line FROM public.weekly_order_items WHERE weekly_order_id = v_weekly_id;
    INSERT INTO public.weekly_order_items (weekly_order_id, line_no, product_id, product_code, product_name, unit, quantity)
    VALUES (v_weekly_id, v_next_line, v_item.product_id, v_item.product_code, v_item.product_name, v_item.unit, v_item.quantity)
    ON CONFLICT (weekly_order_id, product_code, unit)
    DO UPDATE SET quantity = weekly_order_items.quantity + EXCLUDED.quantity, updated_at = now();
  END LOOP;

  UPDATE public.internal_dispatches
  SET status = 'manager_approved', manager_approved_at = now(), manager_approved_by = auth.uid(), updated_at = now()
  WHERE id = _dispatch_id;
  RETURN v_weekly_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_weekly_order(_weekly_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_internal_dispatch_admin() THEN RAISE EXCEPTION 'Chỉ Admin Tổng công ty được xử lý'; END IF;
  UPDATE public.weekly_orders SET status = 'processed', processed_at = now(), processed_by = auth.uid(), updated_at = now() WHERE id = _weekly_order_id;
  UPDATE public.internal_dispatches d SET status = 'processed', processed_at = now(), processed_by = auth.uid(), updated_at = now()
  FROM public.weekly_order_dispatches wd
  WHERE wd.dispatch_id = d.id AND wd.weekly_order_id = _weekly_order_id AND d.status = 'manager_approved';
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_weekly_order_printed(_weekly_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_internal_dispatch_admin()
     AND NOT EXISTS (SELECT 1 FROM public.branch_manager_scopes WHERE manager_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ quản lý được in đơn tuần';
  END IF;
  UPDATE public.weekly_orders
  SET status = CASE WHEN status = 'open' THEN 'printed' ELSE status END,
      printed_at = COALESCE(printed_at, now()), printed_by = COALESCE(printed_by, auth.uid()), updated_at = now()
  WHERE id = _weekly_order_id;
END;
$$;

ALTER TABLE public.branch_manager_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_dispatch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_order_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage dispatch scopes" ON public.branch_manager_scopes FOR ALL USING (public.is_internal_dispatch_admin()) WITH CHECK (public.is_internal_dispatch_admin());
CREATE POLICY "Managers view own scopes" ON public.branch_manager_scopes FOR SELECT USING (manager_user_id = auth.uid());
CREATE POLICY "Branch users view own dispatches" ON public.internal_dispatches FOR SELECT USING (warehouse_id IN (SELECT warehouse_id FROM public.profiles WHERE user_id = auth.uid()) OR public.can_manage_internal_dispatch(warehouse_id));
CREATE POLICY "Branch users create own dispatches" ON public.internal_dispatches FOR INSERT WITH CHECK (warehouse_id IN (SELECT warehouse_id FROM public.profiles WHERE user_id = auth.uid()) OR public.is_internal_dispatch_admin());
CREATE POLICY "Branch users update pending dispatches" ON public.internal_dispatches FOR UPDATE USING ((requested_by = auth.uid() AND status = 'pending_manager') OR public.can_manage_internal_dispatch(warehouse_id)) WITH CHECK ((requested_by = auth.uid() AND status = 'pending_manager') OR public.can_manage_internal_dispatch(warehouse_id));
CREATE POLICY "Dispatch items follow parent visibility" ON public.internal_dispatch_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.internal_dispatches d WHERE d.id = dispatch_id));
CREATE POLICY "Weekly orders are visible to managers" ON public.weekly_orders FOR SELECT USING (public.is_internal_dispatch_admin() OR EXISTS (SELECT 1 FROM public.branch_manager_scopes WHERE manager_user_id = auth.uid()));
CREATE POLICY "Weekly items follow parent visibility" ON public.weekly_order_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.weekly_orders w WHERE w.id = weekly_order_id));
CREATE POLICY "Weekly dispatch links follow weekly visibility" ON public.weekly_order_dispatches FOR SELECT USING (EXISTS (SELECT 1 FROM public.weekly_orders w WHERE w.id = weekly_order_id));

GRANT EXECUTE ON FUNCTION public.create_internal_dispatch(uuid, text, jsonb), public.approve_internal_dispatch(uuid), public.complete_weekly_order(uuid), public.mark_weekly_order_printed(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';