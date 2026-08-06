-- Add price mask columns to flash_sale_products table
-- This allows hiding part of the price to create curiosity (e.g., "?5.000đ" instead of "125.000đ")

ALTER TABLE public.flash_sale_products
ADD COLUMN IF NOT EXISTS price_mask_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS price_mask_hide_first_digits INTEGER NOT NULL DEFAULT 1 CHECK (price_mask_hide_first_digits >= 0 AND price_mask_hide_first_digits <= 3);

-- Add comment
COMMENT ON COLUMN public.flash_sale_products.price_mask_enabled IS 'Enable price masking for this product in flash sale. When enabled, first digits of price will be hidden (e.g., 125.000đ → ?25.000đ)';
COMMENT ON COLUMN public.flash_sale_products.price_mask_hide_first_digits IS 'Number of first digits to hide (0-3). Default is 1. Example: 1 = hide first digit (125.000đ → ?25.000đ), 2 = hide first 2 digits (125.000đ → ?5.000đ)';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_flash_sale_products_price_mask_enabled 
ON public.flash_sale_products(price_mask_enabled) 
WHERE price_mask_enabled = true;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
