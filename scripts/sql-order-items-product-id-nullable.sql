-- Chạy trên Supabase SQL Editor nếu chưa apply migration 20250110000018
-- Nới lỏng / thêm product_id nullable trên order_items

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
        RAISE NOTICE 'skip: %', SQLERRM;
    END;
  ELSE
    ALTER TABLE public.order_items
      ADD COLUMN product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_order_items_product_id
      ON public.order_items(product_id);
  END IF;
END $$;
