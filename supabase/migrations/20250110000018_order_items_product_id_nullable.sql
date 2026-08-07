-- Optional: nếu order_items.product_id tồn tại dạng NOT NULL, nới lỏng
-- để không chặn lưu khi chưa gắn SP (app vẫn ưu tiên auto-upsert + gán id).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name = 'product_id'
  ) THEN
    BEGIN
      ALTER TABLE public.order_items
        ALTER COLUMN product_id DROP NOT NULL;
    EXCEPTION
      WHEN others THEN
        RAISE NOTICE 'order_items.product_id already nullable or alter skipped: %', SQLERRM;
    END;
  ELSE
    ALTER TABLE public.order_items
      ADD COLUMN product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_order_items_product_id
      ON public.order_items(product_id);
  END IF;
END $$;

COMMENT ON COLUMN public.order_items.product_id IS
  'FK products — nullable; app auto-upsert mã ngoài rồi gắn id khi lưu phiếu';
