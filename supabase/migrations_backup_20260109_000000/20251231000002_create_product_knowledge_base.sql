-- Create product knowledge base for RAG and fine-tuning
-- This table stores detailed product information for AI training
-- Note: Embedding columns will be added later when pgvector extension is enabled

-- Create product knowledge table (without embedding column for now)
CREATE TABLE IF NOT EXISTS public.product_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  knowledge_type TEXT NOT NULL CHECK (knowledge_type IN ('description', 'faq', 'specs', 'usage', 'benefits', 'features')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}', -- Additional metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create product FAQs table (without embedding column for now)
CREATE TABLE IF NOT EXISTS public.product_faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_product_knowledge_product_id ON public.product_knowledge(product_id);
CREATE INDEX IF NOT EXISTS idx_product_knowledge_type ON public.product_knowledge(knowledge_type);
CREATE INDEX IF NOT EXISTS idx_product_faqs_product_id ON public.product_faqs(product_id);
CREATE INDEX IF NOT EXISTS idx_product_faqs_is_active ON public.product_faqs(is_active);

-- Enable RLS
ALTER TABLE public.product_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_faqs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Anyone can read, only admins can write
CREATE POLICY "Anyone can view product knowledge"
ON public.product_knowledge
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage product knowledge"
ON public.product_knowledge
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view active FAQs"
ON public.product_faqs
FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage FAQs"
ON public.product_faqs
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Function to update updated_at
CREATE TRIGGER update_product_knowledge_updated_at
BEFORE UPDATE ON public.product_knowledge
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_product_faqs_updated_at
BEFORE UPDATE ON public.product_faqs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Note: To enable vector embeddings for semantic search:
-- 1. Enable pgvector extension in Supabase Dashboard:
--    - Go to Database → Extensions
--    - Enable "vector" extension
-- 2. Then run this SQL to add embedding columns:
--    ALTER TABLE public.product_knowledge ADD COLUMN IF NOT EXISTS embedding vector(1536);
--    ALTER TABLE public.product_faqs ADD COLUMN IF NOT EXISTS embedding vector(1536);

