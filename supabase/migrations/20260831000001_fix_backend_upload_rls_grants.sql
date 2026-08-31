-- Fix: không ghi được data lên Supabase (RLS / GRANT / cột thiếu / schema cache)
-- Idempotent — an toàn chạy lại trên SQL Editor nếu migration list lệch.

-- ---------------------------------------------------------------------------
-- 1) Privileges: bảng mới (internal dispatch, telegram, barcodes) thường thiếu GRANT
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public
  TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
  TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES
  TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Cột catalog import gửi lên (thiếu → PGRST204 / schema cache)
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unit_2 TEXT,
  ADD COLUMN IF NOT EXISTS barcode_2 TEXT,
  ADD COLUMN IF NOT EXISTS parent_sku TEXT,
  ADD COLUMN IF NOT EXISTS is_new BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_out_stock BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS unit_2_ratio numeric,
  ADD COLUMN IF NOT EXISTS price_2 numeric;

DO $$
BEGIN
  IF to_regclass('public.stock_on_hand') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE public.stock_on_hand
    ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS unit_key TEXT NOT NULL DEFAULT '';
  BEGIN
    ALTER TABLE public.stock_on_hand
      ADD CONSTRAINT stock_on_hand_warehouse_product_unit_key
      UNIQUE (warehouse_id, product_id, unit_key);
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN duplicate_table THEN NULL;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Storage: has_role('admin') chặn super_admin / manager / staff
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  DROP POLICY IF EXISTS "Admins can upload product images" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can update product images" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can delete product images" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can upload product videos" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can update product videos" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can delete product videos" ON storage.objects;

  CREATE POLICY "Admins can upload product images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-images' AND public.can_access_admin(auth.uid()));

  CREATE POLICY "Admins can update product images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-images' AND public.can_access_admin(auth.uid()));

  CREATE POLICY "Admins can delete product images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-images' AND public.can_access_admin(auth.uid()));

  CREATE POLICY "Admins can upload product videos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-videos' AND public.can_access_admin(auth.uid()));

  CREATE POLICY "Admins can update product videos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-videos' AND public.can_access_admin(auth.uid()));

  CREATE POLICY "Admins can delete product videos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-videos' AND public.can_access_admin(auth.uid()));
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Không sửa được storage policies (cần chạy bằng postgres). Lỗi: %', SQLERRM;
  WHEN undefined_table THEN
    RAISE NOTICE 'Bỏ qua storage.objects: %', SQLERRM;
  WHEN undefined_function THEN
    RAISE NOTICE 'can_access_admin chưa có — bỏ qua storage policies';
END $$;

-- ---------------------------------------------------------------------------
-- 4) product_barcodes: chỉ cho role admin cũ → super_admin không ghi được
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.product_barcodes') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Admins can manage product barcodes" ON public.product_barcodes;
    CREATE POLICY "Admins can manage product barcodes"
    ON public.product_barcodes FOR ALL
    USING (public.can_access_admin(auth.uid()))
    WITH CHECK (public.can_access_admin(auth.uid()));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5) Internal dispatch: thiếu INSERT/UPDATE trên items + weekly tables
--    SECURITY DEFINER vẫn fail nếu owner không bypass RLS.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.internal_dispatch_items') IS NULL THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "Dispatch items insert with parent" ON public.internal_dispatch_items;
  DROP POLICY IF EXISTS "Dispatch items update with parent" ON public.internal_dispatch_items;
  DROP POLICY IF EXISTS "Dispatch items delete with parent" ON public.internal_dispatch_items;

  CREATE POLICY "Dispatch items insert with parent"
  ON public.internal_dispatch_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.internal_dispatches d
      WHERE d.id = dispatch_id
        AND (
          d.warehouse_id IN (SELECT warehouse_id FROM public.profiles WHERE user_id = auth.uid())
          OR public.is_internal_dispatch_admin()
        )
    )
  );

  CREATE POLICY "Dispatch items update with parent"
  ON public.internal_dispatch_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.internal_dispatches d
      WHERE d.id = dispatch_id
        AND (
          (d.requested_by = auth.uid() AND d.status = 'pending_manager')
          OR public.can_manage_internal_dispatch(d.warehouse_id)
        )
    )
  );

  CREATE POLICY "Dispatch items delete with parent"
  ON public.internal_dispatch_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.internal_dispatches d
      WHERE d.id = dispatch_id
        AND (
          (d.requested_by = auth.uid() AND d.status = 'pending_manager')
          OR public.can_manage_internal_dispatch(d.warehouse_id)
        )
    )
  );

  DROP POLICY IF EXISTS "Managers write weekly orders" ON public.weekly_orders;
  DROP POLICY IF EXISTS "Managers write weekly items" ON public.weekly_order_items;
  DROP POLICY IF EXISTS "Managers write weekly dispatch links" ON public.weekly_order_dispatches;

  CREATE POLICY "Managers write weekly orders"
  ON public.weekly_orders FOR ALL
  USING (
    public.is_internal_dispatch_admin()
    OR EXISTS (SELECT 1 FROM public.branch_manager_scopes s WHERE s.manager_user_id = auth.uid())
  )
  WITH CHECK (
    public.is_internal_dispatch_admin()
    OR EXISTS (SELECT 1 FROM public.branch_manager_scopes s WHERE s.manager_user_id = auth.uid())
  );

  CREATE POLICY "Managers write weekly items"
  ON public.weekly_order_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.weekly_orders w WHERE w.id = weekly_order_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.weekly_orders w WHERE w.id = weekly_order_id));

  CREATE POLICY "Managers write weekly dispatch links"
  ON public.weekly_order_dispatches FOR ALL
  USING (EXISTS (SELECT 1 FROM public.weekly_orders w WHERE w.id = weekly_order_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.weekly_orders w WHERE w.id = weekly_order_id));
END $$;

-- Gộp dòng trùng SKU+ĐVT khi tạo phiếu (UNIQUE dispatch_id, product_code, unit)
DO $wrap$
BEGIN
  IF to_regclass('public.internal_dispatches') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $fn$
CREATE OR REPLACE FUNCTION public.create_internal_dispatch(
  _warehouse_id uuid,
  _notes text,
  _items jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
DECLARE
  v_dispatch_id uuid;
  v_line record;
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
$body$;
  $fn$;

  GRANT EXECUTE ON FUNCTION public.create_internal_dispatch(uuid, text, jsonb) TO authenticated, service_role;
END;
$wrap$;

-- ---------------------------------------------------------------------------
-- 6) Telegram link tables: webhook dùng service_role (bypass) nhưng GRANT vẫn cần
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.telegram_notification_subscriptions') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_notification_subscriptions TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_link_tokens TO service_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
