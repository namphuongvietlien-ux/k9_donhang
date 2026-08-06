-- Add vector embedding columns for semantic search
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

ALTER TABLE public.product_knowledge
  ADD COLUMN IF NOT EXISTS embedding extensions.vector(1536);

ALTER TABLE public.product_faqs
  ADD COLUMN IF NOT EXISTS embedding extensions.vector(1536);
