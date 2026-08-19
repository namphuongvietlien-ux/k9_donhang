CREATE TABLE IF NOT EXISTS public.product_barcodes (
  product_slug TEXT NOT NULL REFERENCES public.products(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  barcode TEXT NOT NULL,
  unit TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_slug, barcode)
);

CREATE INDEX IF NOT EXISTS idx_product_barcodes_barcode
  ON public.product_barcodes (barcode);

ALTER TABLE public.product_barcodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view product barcodes" ON public.product_barcodes;
CREATE POLICY "Anyone can view product barcodes"
  ON public.product_barcodes FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "Admins can manage product barcodes" ON public.product_barcodes;
CREATE POLICY "Admins can manage product barcodes"
  ON public.product_barcodes FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));