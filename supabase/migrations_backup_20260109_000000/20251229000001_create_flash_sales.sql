-- Create flash_sales table
CREATE TABLE IF NOT EXISTS public.flash_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC NOT NULL DEFAULT 0,
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  banner_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT flash_sales_ends_after_starts CHECK (ends_at > starts_at)
);

-- Create flash_sale_products junction table (many-to-many)
CREATE TABLE IF NOT EXISTS public.flash_sale_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flash_sale_id UUID NOT NULL REFERENCES public.flash_sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  flash_sale_price NUMERIC, -- Optional: override price for this product in this flash sale
  max_quantity INTEGER, -- Optional: limit quantity per customer
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (flash_sale_id, product_id)
);

-- Enable RLS
ALTER TABLE public.flash_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flash_sale_products ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view active flash sales that are currently running
DROP POLICY IF EXISTS "Anyone can view active flash sales" ON public.flash_sales;
CREATE POLICY "Anyone can view active flash sales"
ON public.flash_sales
FOR SELECT
USING (
  is_active = true 
  AND starts_at <= now() 
  AND ends_at > now()
);

-- Policy: Anyone can view flash sale products for active flash sales
DROP POLICY IF EXISTS "Anyone can view flash sale products" ON public.flash_sale_products;
CREATE POLICY "Anyone can view flash sale products"
ON public.flash_sale_products
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.flash_sales
    WHERE flash_sales.id = flash_sale_products.flash_sale_id
    AND flash_sales.is_active = true
    AND flash_sales.starts_at <= now()
    AND flash_sales.ends_at > now()
  )
);

-- Policy: Admins can manage all flash sales
DROP POLICY IF EXISTS "Admins can manage flash sales" ON public.flash_sales;
CREATE POLICY "Admins can manage flash sales"
ON public.flash_sales
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Policy: Admins can manage flash sale products
DROP POLICY IF EXISTS "Admins can manage flash sale products" ON public.flash_sale_products;
CREATE POLICY "Admins can manage flash sale products"
ON public.flash_sale_products
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_flash_sales_active ON public.flash_sales(is_active, starts_at, ends_at) 
WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_flash_sales_display_order ON public.flash_sales(display_order DESC);
CREATE INDEX IF NOT EXISTS idx_flash_sale_products_flash_sale_id ON public.flash_sale_products(flash_sale_id);
CREATE INDEX IF NOT EXISTS idx_flash_sale_products_product_id ON public.flash_sale_products(product_id);

-- Add trigger for updated_at
CREATE TRIGGER update_flash_sales_updated_at
BEFORE UPDATE ON public.flash_sales
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to get active flash sales
DROP FUNCTION IF EXISTS public.get_active_flash_sales();
CREATE FUNCTION public.get_active_flash_sales()
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  discount_type TEXT,
  discount_value NUMERIC,
  starts_at TIMESTAMP WITH TIME ZONE,
  ends_at TIMESTAMP WITH TIME ZONE,
  banner_image_url TEXT,
  display_order INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    fs.id,
    fs.title,
    fs.description,
    fs.discount_type,
    fs.discount_value,
    fs.starts_at,
    fs.ends_at,
    fs.banner_image_url,
    fs.display_order
  FROM public.flash_sales fs
  WHERE fs.is_active = true
    AND fs.starts_at <= now()
    AND fs.ends_at > now()
  ORDER BY fs.display_order DESC, fs.created_at DESC;
$$;

-- Function to get flash sale price for a product
DROP FUNCTION IF EXISTS public.get_flash_sale_price(UUID, NUMERIC);
CREATE FUNCTION public.get_flash_sale_price(
  _product_id UUID,
  _base_price NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT 
        CASE 
          WHEN fs.discount_type = 'percentage' THEN
            _base_price * (1 - fs.discount_value / 100)
          WHEN fs.discount_type = 'fixed' THEN
            GREATEST(_base_price - fs.discount_value, 0)
          ELSE _base_price
        END
      FROM public.flash_sale_products fsp
      JOIN public.flash_sales fs ON fs.id = fsp.flash_sale_id
      WHERE fsp.product_id = _product_id
        AND fs.is_active = true
        AND fs.starts_at <= now()
        AND fs.ends_at > now()
      ORDER BY fs.display_order DESC, fs.created_at DESC
      LIMIT 1
    ),
    (
      SELECT fsp.flash_sale_price
      FROM public.flash_sale_products fsp
      JOIN public.flash_sales fs ON fs.id = fsp.flash_sale_id
      WHERE fsp.product_id = _product_id
        AND fsp.flash_sale_price IS NOT NULL
        AND fs.is_active = true
        AND fs.starts_at <= now()
        AND fs.ends_at > now()
      ORDER BY fs.display_order DESC, fs.created_at DESC
      LIMIT 1
    ),
    _base_price
  );
$$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

