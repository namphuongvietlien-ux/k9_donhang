-- Thuật toán tính mã cũ → mã mới và khóa mã cũ.
--
-- Bối cảnh: danh mục đã đổi sang mã HV 10 ký tự ([C/M/H][2 nhóm][3 quy cách][4 số]); mã cũ
-- (TAM2012, TAC2018, …) vẫn còn trong products và trong order_items. Khi xuất lệnh điều chuyển
-- sang KiotViet/MISA, dòng mang mã cũ + mã vạch (đã gắn cho mã mới) bị báo
-- "Mã hàng hóa và mã vạch không trùng khớp".
--
-- Quy tắc ghép: mã cũ (không phải dạng HV) và mã mới (dạng HV) có CÙNG MÃ VẠCH
-- (barcode hoặc barcode_2, so khớp sau upper/trim). Chỉ ghép khi duy nhất 1 mã mới;
-- nhiều ứng viên → "ambiguous" (để admin xử lý tay), không có → "no_match".
-- Tuỳ chọn: ghép theo tên chuẩn hoá khi mã cũ không có mã vạch (_include_name_matches).
--
-- Áp dụng (_dry_run = false):
--   1) upsert public.sku_code_mappings (short_slug → long_slug, barcode)
--   2) khóa mã cũ: products.is_locked = true (không thêm được vào phiếu mới; trigger
--      apply_sku_code_mapping_on_order_item tự đổi sang mã mới nếu lọt vào)
--   3) đổi mã trên order_items của phiếu chưa khóa / chưa hoàn thành / chưa hủy
--
-- Dùng:
--   SELECT * FROM public.compute_sku_code_mappings();              -- xem trước
--   SELECT * FROM public.compute_sku_code_mappings(false);         -- áp dụng
--   SELECT * FROM public.compute_sku_code_mappings(false, true, true); -- + ghép theo tên
--   SELECT * FROM public.v_sku_code_mapping_gaps;                  -- mã cũ còn dùng, chưa có mã mới

CREATE OR REPLACE FUNCTION public.fold_sku_text(_v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(trim(regexp_replace(coalesce(_v, ''), '[[:space:][:punct:]]+', ' ', 'g')))
$$;

/** Phần gốc của slug (bỏ hậu tố biến thể -01, _S) có đúng dạng mã HV 10 ký tự không */
CREATE OR REPLACE FUNCTION public.is_hv_sku(_slug text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT upper(split_part(trim(coalesce(_slug, '')), '-', 1)) ~ '^[CMH][A-ZĐ]{5}[0-9]{4}$'
$$;

CREATE OR REPLACE FUNCTION public.compute_sku_code_mappings(
  _dry_run boolean DEFAULT true,
  _lock_old boolean DEFAULT true,
  _include_name_matches boolean DEFAULT false
)
RETURNS TABLE (
  short_slug text,
  short_name text,
  long_slug text,
  long_name text,
  barcode text,
  status text,          -- mapped | mapped_by_name | ambiguous | no_match
  candidates text,      -- danh sách mã mới khi ambiguous
  open_order_lines int  -- số dòng phiếu đang mở còn mang mã cũ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_row record;
  v_long_id uuid;
  v_barcode text;
  v_updated int;
BEGIN
  IF NOT public.can_access_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ admin mới được tính mã cũ → mã mới';
  END IF;

  DROP TABLE IF EXISTS tmp_old; DROP TABLE IF EXISTS tmp_new; DROP TABLE IF EXISTS tmp_pair;
  CREATE TEMP TABLE tmp_old ON COMMIT DROP AS
  SELECT p.id, p.slug, p.name,
         NULLIF(upper(trim(p.barcode)), '')   AS bc1,
         NULLIF(upper(trim(p.barcode_2)), '') AS bc2,
         public.fold_sku_text(p.name)          AS name_key
  FROM public.products p
  WHERE COALESCE(p.is_active, true)
    AND NOT public.is_hv_sku(p.slug)
    AND NOT EXISTS (SELECT 1 FROM public.sku_code_mappings m WHERE m.long_slug = p.slug);

  CREATE TEMP TABLE tmp_new ON COMMIT DROP AS
  SELECT p.id, p.slug, p.name,
         NULLIF(upper(trim(p.barcode)), '')   AS bc1,
         NULLIF(upper(trim(p.barcode_2)), '') AS bc2,
         public.fold_sku_text(p.name)          AS name_key
  FROM public.products p
  WHERE COALESCE(p.is_active, true)
    AND public.is_hv_sku(p.slug);

  -- Ghép theo mã vạch (barcode / barcode_2 hai chiều)
  CREATE TEMP TABLE tmp_pair ON COMMIT DROP AS
  SELECT DISTINCT o.slug AS short_slug, n.slug AS long_slug, n.id AS long_id,
         COALESCE(n.bc1, n.bc2) AS barcode, 'mapped'::text AS how
  FROM tmp_old o
  JOIN tmp_new n
    ON (o.bc1 IS NOT NULL AND o.bc1 IN (n.bc1, n.bc2))
    OR (o.bc2 IS NOT NULL AND o.bc2 IN (n.bc1, n.bc2));

  -- Ghép theo tên (chỉ mã cũ không ghép được theo mã vạch, tên trùng duy nhất)
  IF _include_name_matches THEN
    INSERT INTO tmp_pair
    SELECT o.slug, n.slug, n.id, COALESCE(n.bc1, n.bc2), 'mapped_by_name'
    FROM tmp_old o
    JOIN tmp_new n ON n.name_key = o.name_key AND length(o.name_key) >= 6
    WHERE NOT EXISTS (SELECT 1 FROM tmp_pair p WHERE p.short_slug = o.slug);
  END IF;

  FOR v_row IN
    SELECT o.slug AS short_slug, o.name AS short_name,
           (SELECT count(DISTINCT p.long_slug) FROM tmp_pair p WHERE p.short_slug = o.slug) AS n_cand,
           (SELECT min(p.long_slug) FROM tmp_pair p WHERE p.short_slug = o.slug) AS long_slug,
           (SELECT min(p.how) FROM tmp_pair p WHERE p.short_slug = o.slug) AS how,
           (SELECT string_agg(DISTINCT p.long_slug, ', ') FROM tmp_pair p WHERE p.short_slug = o.slug) AS cands,
           (SELECT count(*) FROM public.order_items oi
              JOIN public.orders od ON od.id = oi.order_id
             WHERE oi.product_slug = o.slug
               AND COALESCE(od.is_locked, false) = false
               AND COALESCE(od.status, '') NOT IN ('completed', 'cancelled')) AS open_lines
    FROM tmp_old o
    WHERE EXISTS (SELECT 1 FROM tmp_pair p WHERE p.short_slug = o.slug)
       OR EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.product_slug = o.slug)
    ORDER BY o.slug
  LOOP
    short_slug := v_row.short_slug;
    short_name := v_row.short_name;
    open_order_lines := v_row.open_lines;
    candidates := v_row.cands;

    IF v_row.n_cand = 1 THEN
      SELECT p.long_id, p.barcode INTO v_long_id, v_barcode
      FROM tmp_pair p WHERE p.short_slug = v_row.short_slug LIMIT 1;
      barcode := v_barcode;
      long_slug := v_row.long_slug;
      long_name := (SELECT n.name FROM tmp_new n WHERE n.slug = v_row.long_slug);
      status := v_row.how;

      IF NOT _dry_run THEN
        INSERT INTO public.sku_code_mappings (short_slug, long_slug, barcode, created_by)
        VALUES (v_row.short_slug, v_row.long_slug, COALESCE(v_barcode, ''), auth.uid())
        ON CONFLICT (short_slug) DO UPDATE
          SET long_slug = EXCLUDED.long_slug,
              barcode = EXCLUDED.barcode,
              updated_at = now();

        IF _lock_old THEN
          UPDATE public.products
          SET is_locked = true, updated_at = now()
          WHERE slug = v_row.short_slug AND COALESCE(is_locked, false) = false;
        END IF;

        UPDATE public.order_items oi
        SET product_slug = v_row.long_slug,
            product_id = v_long_id,
            barcode = COALESCE(NULLIF(trim(oi.barcode), ''), NULLIF(v_barcode, ''))
        FROM public.orders od
        WHERE od.id = oi.order_id
          AND oi.product_slug = v_row.short_slug
          AND COALESCE(od.is_locked, false) = false
          AND COALESCE(od.status, '') NOT IN ('completed', 'cancelled');
        GET DIAGNOSTICS v_updated = ROW_COUNT;
        open_order_lines := v_updated;
      END IF;
    ELSIF v_row.n_cand > 1 THEN
      long_slug := NULL; long_name := NULL; barcode := NULL;
      status := 'ambiguous';
    ELSE
      long_slug := NULL; long_name := NULL; barcode := NULL;
      status := 'no_match';
    END IF;

    RETURN NEXT;
  END LOOP;

  IF NOT _dry_run THEN
    PERFORM pg_notify('pgrst', 'reload schema');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_sku_code_mappings(boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fold_sku_text(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_hv_sku(text) TO authenticated, anon;

-- Mã cũ còn xuất hiện trên phiếu đang mở mà chưa có mã mới → cần xử lý tay
CREATE OR REPLACE VIEW public.v_sku_code_mapping_gaps AS
SELECT
  oi.product_slug AS short_slug,
  max(oi.product_name) AS product_name,
  max(COALESCE(NULLIF(trim(oi.barcode), ''), p.barcode)) AS barcode,
  count(*) AS open_order_lines,
  string_agg(DISTINCT od.order_code, ', ') AS order_codes
FROM public.order_items oi
JOIN public.orders od ON od.id = oi.order_id
LEFT JOIN public.products p ON p.slug = oi.product_slug
WHERE COALESCE(od.is_locked, false) = false
  AND COALESCE(od.status, '') NOT IN ('completed', 'cancelled')
  AND NOT public.is_hv_sku(oi.product_slug)
  AND NOT EXISTS (SELECT 1 FROM public.sku_code_mappings m WHERE m.short_slug = oi.product_slug)
GROUP BY oi.product_slug
ORDER BY count(*) DESC;

GRANT SELECT ON public.v_sku_code_mapping_gaps TO authenticated;

-- Cho phép đọc bảng mapping từ client (RLS đã bật, chỉ có policy admin) → thêm policy đọc
DROP POLICY IF EXISTS "Authenticated read SKU code mappings" ON public.sku_code_mappings;
CREATE POLICY "Authenticated read SKU code mappings"
  ON public.sku_code_mappings FOR SELECT
  USING (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';
