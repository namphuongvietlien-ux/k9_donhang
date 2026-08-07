-- Chạy trên Supabase SQL Editor (prod) nếu chưa apply migration 20250110000016.
-- Tồn kho theo (kho, mã SP, ĐVT).

ALTER TABLE public.stock_on_hand
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS unit_key TEXT NOT NULL DEFAULT '';

UPDATE public.stock_on_hand soh
SET
  unit = COALESCE(NULLIF(TRIM(p.unit), ''), 'cái'),
  unit_key = lower(
    regexp_replace(
      translate(
        lower(trim(COALESCE(NULLIF(TRIM(p.unit), ''), 'cái'))),
        'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ',
        'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
      ),
      '\s+',
      '',
      'g'
    )
  )
FROM public.products p
WHERE p.id = soh.product_id
  AND (soh.unit_key = '' OR soh.unit_key IS NULL);

UPDATE public.stock_on_hand
SET unit_key = lower(
  regexp_replace(
    translate(
      lower(trim(unit)),
      'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ',
      'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
    ),
    '\s+',
    '',
    'g'
  )
)
WHERE unit_key = '' AND unit <> '';

UPDATE public.stock_on_hand
SET unit = 'cái', unit_key = 'cai'
WHERE unit_key = '' OR unit_key IS NULL;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY warehouse_id, product_id, unit_key
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
    ) AS rn
  FROM public.stock_on_hand
)
DELETE FROM public.stock_on_hand soh
USING ranked r
WHERE soh.id = r.id AND r.rn > 1;

DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'stock_on_hand'
      AND con.contype = 'u'
      AND pg_get_constraintdef(con.oid) ILIKE '%warehouse_id%product_id%'
      AND pg_get_constraintdef(con.oid) NOT ILIKE '%unit_key%'
  LOOP
    EXECUTE format('ALTER TABLE public.stock_on_hand DROP CONSTRAINT IF EXISTS %I', cname);
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.stock_on_hand_warehouse_id_product_id_key;
DROP INDEX IF EXISTS public.stock_on_hand_warehouse_product_unit_uidx;

DO $$
BEGIN
  ALTER TABLE public.stock_on_hand
    ADD CONSTRAINT stock_on_hand_warehouse_product_unit_key
    UNIQUE (warehouse_id, product_id, unit_key);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_stock_on_hand_unit_key
  ON public.stock_on_hand (unit_key);
