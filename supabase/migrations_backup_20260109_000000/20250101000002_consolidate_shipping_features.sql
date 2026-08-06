-- =====================================================
-- CONSOLIDATED SHIPPING FEATURES MIGRATION
-- =====================================================
-- This migration consolidates all shipping-related column additions
-- that were previously split across multiple files.
-- 
-- Replaces:
-- - 20250101000002_add_shipping_fee.sql
-- - 20250101000003_add_shipping_settings.sql
-- - 20250101000004_add_product_shipping_fee.sql
-- - 20250101000005_add_product_free_shipping_threshold.sql
-- - 20250101000006_add_product_shipping_dimensions.sql
-- - 20250101000011_add_shipping_province_setting.sql
-- - 20250101000012_add_shipping_province_to_orders.sql
-- =====================================================

BEGIN;

-- =====================================================
-- 1. ORDERS TABLE - Shipping Fee Columns
-- =====================================================

-- Add shipping fee columns to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS shipping_fee DECIMAL(12, 0) DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_free_shipping BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS subtotal DECIMAL(12, 0) DEFAULT 0,
ADD COLUMN IF NOT EXISTS shipping_province TEXT;

-- Add shipping_fee to order_items (for future Phase 2 - product-level shipping)
ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS shipping_fee DECIMAL(12, 0) DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN public.orders.shipping_fee IS 'Phí vận chuyển của đơn hàng. 0 nếu được miễn phí.';
COMMENT ON COLUMN public.orders.is_free_shipping IS 'Đánh dấu đơn hàng có được miễn phí vận chuyển không';
COMMENT ON COLUMN public.orders.subtotal IS 'Tổng tiền sản phẩm trước khi tính shipping fee và giảm giá';
COMMENT ON COLUMN public.orders.shipping_province IS 'Mã tỉnh/thành phố nhận hàng (dùng để tính phí vận chuyển SPX Express)';
COMMENT ON COLUMN public.order_items.shipping_fee IS 'Phí vận chuyển của sản phẩm này (cho Phase 2)';

-- =====================================================
-- 2. PRODUCTS TABLE - Shipping Columns
-- =====================================================

-- Add shipping_fee column to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS shipping_fee DECIMAL(12, 0) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS free_shipping_threshold DECIMAL(12, 0) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS weight DECIMAL(10, 2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS package_length DECIMAL(10, 2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS package_width DECIMAL(10, 2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS package_height DECIMAL(10, 2) DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.products.shipping_fee IS 'Phí vận chuyển riêng của sản phẩm. NULL = dùng default_shipping_fee từ settings. Có giá trị = dùng shipping_fee của sản phẩm.';
COMMENT ON COLUMN public.products.free_shipping_threshold IS 'Ngưỡng miễn phí vận chuyển riêng của sản phẩm. NULL = dùng free_shipping_threshold từ settings.';
COMMENT ON COLUMN public.products.weight IS 'Trọng lượng sản phẩm (kg)';
COMMENT ON COLUMN public.products.package_length IS 'Chiều dài đóng gói (cm)';
COMMENT ON COLUMN public.products.package_width IS 'Chiều rộng đóng gói (cm)';
COMMENT ON COLUMN public.products.package_height IS 'Chiều cao đóng gói (cm)';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_products_shipping_fee ON public.products(shipping_fee) WHERE shipping_fee IS NOT NULL;

-- =====================================================
-- 3. SITE SETTINGS - Shipping Settings
-- =====================================================

-- Add shipping settings to site_settings
INSERT INTO public.site_settings (setting_key, setting_value, setting_type) 
VALUES 
  ('free_shipping_threshold', '300000', 'number'),
  ('default_shipping_fee', '30000', 'number'),
  ('shipping_province_code', 'HCM', 'text')
ON CONFLICT (setting_key) DO UPDATE 
SET setting_value = EXCLUDED.setting_value;

COMMIT;

