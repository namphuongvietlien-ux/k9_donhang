-- Đổi tên sản phẩm trên catalog + snapshot tên trên đơn/phiếu cũ (cùng mã hàng).
-- Áp dụng: node scripts/apply-rename-product.mjs

CREATE OR REPLACE FUNCTION public.prevent_locked_order_item_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
BEGIN
  -- RPC rename_product_everywhere: chỉ đổi tên, kể cả đơn đã khóa.
  IF TG_OP = 'UPDATE'
     AND current_setting('k9.rename_product', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
  ELSE
    v_order_id := NEW.order_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orders
    WHERE id = v_order_id
      AND is_locked = TRUE
      AND NOT public.can_access_admin((select auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Đơn đã bị khóa. Hãy tạo đơn mới.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.rename_product_everywhere(
  p_product_id uuid,
  p_new_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_old_name text;
  v_slug_norm text;
  v_name text;
  v_has_product_id boolean;
  n_orders int := 0;
  n_dispatch int := 0;
  n_weekly int := 0;
  n_voucher int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Cần đăng nhập';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_permission(auth.uid(), 'products.update')
  ) THEN
    RAISE EXCEPTION 'Không có quyền đổi tên sản phẩm (products.update)';
  END IF;

  v_name := btrim(p_new_name);
  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Tên sản phẩm không được trống';
  END IF;
  IF char_length(v_name) > 200 THEN
    RAISE EXCEPTION 'Tên sản phẩm tối đa 200 ký tự';
  END IF;

  SELECT slug, name
    INTO v_slug, v_old_name
  FROM public.products
  WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy sản phẩm';
  END IF;

  v_slug_norm := upper(btrim(COALESCE(v_slug, '')));

  PERFORM set_config('k9.rename_product', '1', true);

  UPDATE public.products
  SET name = v_name
  WHERE id = p_product_id
    AND name IS DISTINCT FROM v_name;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name = 'product_id'
  ) INTO v_has_product_id;

  IF v_has_product_id THEN
    UPDATE public.order_items
    SET product_name = v_name
    WHERE product_name IS DISTINCT FROM v_name
      AND (
        product_id = p_product_id
        OR (
          v_slug_norm <> ''
          AND upper(btrim(COALESCE(product_slug, ''))) = v_slug_norm
        )
      );
  ELSE
    UPDATE public.order_items
    SET product_name = v_name
    WHERE product_name IS DISTINCT FROM v_name
      AND v_slug_norm <> ''
      AND upper(btrim(COALESCE(product_slug, ''))) = v_slug_norm;
  END IF;
  GET DIAGNOSTICS n_orders = ROW_COUNT;

  IF to_regclass('public.internal_dispatch_items') IS NOT NULL THEN
    UPDATE public.internal_dispatch_items
    SET product_name = v_name
    WHERE product_name IS DISTINCT FROM v_name
      AND (
        product_id = p_product_id
        OR (
          v_slug_norm <> ''
          AND upper(btrim(product_code)) = v_slug_norm
        )
      );
    GET DIAGNOSTICS n_dispatch = ROW_COUNT;
  END IF;

  IF to_regclass('public.weekly_order_items') IS NOT NULL THEN
    UPDATE public.weekly_order_items
    SET product_name = v_name
    WHERE product_name IS DISTINCT FROM v_name
      AND (
        product_id = p_product_id
        OR (
          v_slug_norm <> ''
          AND upper(btrim(product_code)) = v_slug_norm
        )
      );
    GET DIAGNOSTICS n_weekly = ROW_COUNT;
  END IF;

  IF to_regclass('public.sales_voucher_items') IS NOT NULL THEN
    UPDATE public.sales_voucher_items
    SET product_name = v_name
    WHERE product_name IS DISTINCT FROM v_name
      AND v_slug_norm <> ''
      AND upper(btrim(COALESCE(product_slug, ''))) = v_slug_norm;
    GET DIAGNOSTICS n_voucher = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'slug', v_slug,
    'old_name', v_old_name,
    'new_name', v_name,
    'order_items', n_orders,
    'dispatch_items', n_dispatch,
    'weekly_items', n_weekly,
    'voucher_items', n_voucher
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rename_product_everywhere(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_product_everywhere(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.rename_product_everywhere(uuid, text) IS
  'Đổi products.name và snapshot product_name trên đơn/phiếu cùng mã hàng (kể cả đơn khóa).';

NOTIFY pgrst, 'reload schema';
