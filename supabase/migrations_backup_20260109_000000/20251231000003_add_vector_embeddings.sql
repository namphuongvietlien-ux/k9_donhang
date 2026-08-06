-- Add vector embedding columns for semantic search
-- Run this migration AFTER enabling pgvector extension in Supabase Dashboard
-- 
-- Steps:
-- 1. Go to Supabase Dashboard → Database → Extensions
-- 2. Enable "vector" extension
-- 3. Run this migration

-- Check if pgvector extension exists before adding columns
DO $$
BEGIN
  -- Check if vector extension is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    -- Add embedding column to product_knowledge
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'product_knowledge' 
      AND column_name = 'embedding'
    ) THEN
      ALTER TABLE public.product_knowledge ADD COLUMN embedding vector(1536);
      RAISE NOTICE 'Added embedding column to product_knowledge';
    END IF;

    -- Add embedding column to product_faqs
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'product_faqs' 
      AND column_name = 'embedding'
    ) THEN
      ALTER TABLE public.product_faqs ADD COLUMN embedding vector(1536);
      RAISE NOTICE 'Added embedding column to product_faqs';
    END IF;
  ELSE
    RAISE EXCEPTION 'pgvector extension is not enabled. Please enable it in Supabase Dashboard first.';
  END IF;
END $$;

