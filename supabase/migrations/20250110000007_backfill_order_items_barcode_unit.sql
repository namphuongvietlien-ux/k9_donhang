-- Backfill snapshot barcode/unit trên order_items từ products (phiếu cũ thiếu)
UPDATE public.order_items oi
SET
  barcode = COALESCE(NULLIF(TRIM(oi.barcode), ''), p.barcode),
  unit = COALESCE(NULLIF(TRIM(oi.unit), ''), p.unit)
FROM public.products p
WHERE oi.product_slug IS NOT NULL
  AND oi.product_slug <> ''
  AND lower(trim(oi.product_slug)) = lower(trim(p.slug))
  AND (
    oi.barcode IS NULL OR trim(oi.barcode) = ''
    OR oi.unit IS NULL OR trim(oi.unit) = ''
  );

NOTIFY pgrst, 'reload schema';
