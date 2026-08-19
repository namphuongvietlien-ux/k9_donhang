-- Chuẩn hóa mã hàng cũ (ngắn) trong đơn theo danh mục mã mới (dài) cùng mã vạch.
-- Chỉ cập nhật khi mỗi dòng đơn có đúng một ứng viên mã mới dài hơn, tránh đổi nhầm.

DO $$
DECLARE
  v_updated_count integer := 0;
BEGIN
  WITH source_lines AS (
    SELECT
      oi.id AS order_item_id,
      oi.product_slug AS old_slug,
      COALESCE(NULLIF(trim(oi.barcode), ''), NULLIF(trim(old_product.barcode), '')) AS barcode
    FROM public.order_items oi
    LEFT JOIN public.products old_product ON old_product.slug = oi.product_slug
    JOIN public.orders order_row ON order_row.id = oi.order_id
    WHERE NULLIF(trim(oi.product_slug), '') IS NOT NULL
      AND COALESCE(order_row.is_locked, false) = false
  ),
  candidate_products AS (
    SELECT
      source_lines.order_item_id,
      product.id AS new_product_id,
      product.slug AS new_slug
    FROM source_lines
    JOIN public.products product
      ON upper(trim(product.barcode)) = upper(trim(source_lines.barcode))
     AND length(trim(product.slug)) > length(trim(source_lines.old_slug))
     AND COALESCE(product.is_active, true) = true
    WHERE source_lines.barcode IS NOT NULL
  ),
  unambiguous_replacements AS (
    SELECT
      order_item_id,
      (array_agg(new_product_id))[1] AS new_product_id,
      min(new_slug) AS new_slug
    FROM candidate_products
    GROUP BY order_item_id
    HAVING count(*) = 1
  )
  UPDATE public.order_items oi
  SET
    product_slug = replacement.new_slug,
    product_id = replacement.new_product_id
  FROM unambiguous_replacements replacement
  WHERE oi.id = replacement.order_item_id
    AND oi.product_slug IS DISTINCT FROM replacement.new_slug;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Đã đổi % dòng order_items từ mã cũ ngắn sang mã mới cùng barcode.', v_updated_count;
END $$;

NOTIFY pgrst, 'reload schema';
