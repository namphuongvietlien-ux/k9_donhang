CREATE TABLE public.sku_code_mappings (
  short_slug text PRIMARY KEY REFERENCES public.products(slug) ON UPDATE CASCADE ON DELETE RESTRICT,
  long_slug text NOT NULL REFERENCES public.products(slug) ON UPDATE CASCADE ON DELETE RESTRICT,
  barcode text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sku_code_mappings_different_codes CHECK (short_slug <> long_slug)
);

ALTER TABLE public.sku_code_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage SKU code mappings"
  ON public.sku_code_mappings FOR ALL
  USING (public.can_access_admin(auth.uid()))
  WITH CHECK (public.can_access_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.save_sku_code_mapping(
  _short_slug text,
  _long_slug text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_short record;
  v_long record;
  v_updated_count integer := 0;
BEGIN
  IF NOT public.can_access_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Không có quyền quản lý mapping mã hàng';
  END IF;

  SELECT slug, barcode INTO v_short
  FROM public.products
  WHERE slug = trim(_short_slug);
  SELECT slug, barcode, id INTO v_long
  FROM public.products
  WHERE slug = trim(_long_slug);

  IF NOT FOUND OR v_long.slug IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy mã mới: %', _long_slug;
  END IF;
  IF v_short.slug IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy mã cũ: %', _short_slug;
  END IF;
  IF length(v_long.slug) <= length(v_short.slug) THEN
    RAISE EXCEPTION 'Mã mới phải dài hơn mã cũ';
  END IF;
  IF NULLIF(trim(v_short.barcode), '') IS NULL
     OR upper(trim(v_short.barcode)) <> upper(trim(v_long.barcode)) THEN
    RAISE EXCEPTION 'Hai mã phải có cùng mã vạch';
  END IF;

  INSERT INTO public.sku_code_mappings (short_slug, long_slug, barcode, created_by)
  VALUES (v_short.slug, v_long.slug, v_long.barcode, auth.uid())
  ON CONFLICT (short_slug) DO UPDATE
  SET long_slug = EXCLUDED.long_slug,
      barcode = EXCLUDED.barcode,
      created_by = EXCLUDED.created_by,
      updated_at = now();

  UPDATE public.order_items oi
  SET product_slug = v_long.slug,
      product_id = v_long.id
  FROM public.orders o
  WHERE o.id = oi.order_id
    AND COALESCE(o.is_locked, false) = false
    AND oi.product_slug = v_short.slug
    AND (
      NULLIF(trim(oi.barcode), '') IS NULL
      OR upper(trim(oi.barcode)) = upper(trim(v_long.barcode))
    );
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN v_updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_sku_code_mapping_on_order_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mapping record;
  v_product_id uuid;
BEGIN
  SELECT mapping.long_slug, mapping.barcode INTO v_mapping
  FROM public.sku_code_mappings mapping
  WHERE mapping.short_slug = NEW.product_slug;

  IF FOUND AND (
    NULLIF(trim(NEW.barcode), '') IS NULL
    OR upper(trim(NEW.barcode)) = upper(trim(v_mapping.barcode))
  ) THEN
    SELECT id INTO v_product_id FROM public.products WHERE slug = v_mapping.long_slug;
    NEW.product_slug := v_mapping.long_slug;
    NEW.product_id := v_product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_sku_code_mapping_on_order_item ON public.order_items;
CREATE TRIGGER trg_apply_sku_code_mapping_on_order_item
  BEFORE INSERT OR UPDATE OF product_slug, barcode ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.apply_sku_code_mapping_on_order_item();

GRANT EXECUTE ON FUNCTION public.save_sku_code_mapping(text, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
