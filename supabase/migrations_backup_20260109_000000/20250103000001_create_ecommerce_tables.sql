-- Ecommerce Orders Tracking System
-- Phase 1: Database Schema

-- 1. Ecommerce Platforms Table
CREATE TABLE IF NOT EXISTS public.ecommerce_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL, -- 'Shopee', 'TikTok Shop'
  code VARCHAR(50) NOT NULL UNIQUE, -- 'shopee', 'tiktok'
  tracking_api_type VARCHAR(20) NOT NULL CHECK (tracking_api_type IN ('rest_api', 'web_scrape')),
  tracking_api_endpoint TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Ecommerce Orders Table
CREATE TABLE IF NOT EXISTS public.ecommerce_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_code VARCHAR(50) NOT NULL,
  
  -- Tracking info (từ API)
  tracking_code VARCHAR(100) NOT NULL UNIQUE,
  platform_order_id VARCHAR(255), -- client_order_id từ API
  phone_last_4 VARCHAR(4), -- Cho J&T Express
  
  -- Link với đơn hàng nội bộ (nếu có)
  internal_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  
  -- Trạng thái tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'tracking', 'in_transit', 'delivered', 'returned', 'cancelled')),
  delivery_status VARCHAR(50), -- 'preparing', 'in_transit', 'delivered', etc.
  last_milestone_code INT, -- Milestone code mới nhất
  last_milestone_name VARCHAR(100),
  
  -- Tracking metadata
  delivered_at TIMESTAMP WITH TIME ZONE,
  delivered_to VARCHAR(255), -- Người nhận (nếu có trong API)
  
  -- Integration với hệ thống nội bộ
  accounts_receivable_id UUID REFERENCES public.accounts_receivable(id) ON DELETE SET NULL,
  total_amount DECIMAL(12, 0) NOT NULL DEFAULT 0, -- Tổng tiền (tính từ items)
  
  -- Sync info
  last_synced_at TIMESTAMP WITH TIME ZONE,
  sync_count INT DEFAULT 0,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (platform_code) REFERENCES public.ecommerce_platforms(code),
  
  -- Unique constraint: Mỗi platform chỉ có 1 tracking code
  CONSTRAINT unique_platform_tracking UNIQUE (platform_code, tracking_code)
);

CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_platform_code ON public.ecommerce_orders(platform_code);
CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_tracking_code ON public.ecommerce_orders(tracking_code);
CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_status ON public.ecommerce_orders(status);
CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_delivery_status ON public.ecommerce_orders(delivery_status);
CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_last_milestone_code ON public.ecommerce_orders(last_milestone_code);
CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_internal_order_id ON public.ecommerce_orders(internal_order_id);
CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_last_synced_at ON public.ecommerce_orders(last_synced_at);

-- 3. Ecommerce Order Items Table
CREATE TABLE IF NOT EXISTS public.ecommerce_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ecommerce_order_id UUID NOT NULL REFERENCES public.ecommerce_orders(id) ON DELETE CASCADE,
  
  -- Link với sản phẩm trong hệ thống
  internal_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  
  -- Giá bán (admin nhập)
  unit_price DECIMAL(12, 0) NOT NULL CHECK (unit_price >= 0),
  total_price DECIMAL(12, 0) NOT NULL CHECK (total_price >= 0), -- unit_price * quantity
  
  -- Thông tin từ order_items (nếu có internal_order_id)
  order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for ecommerce_order_items
CREATE INDEX IF NOT EXISTS idx_ecommerce_order_items_ecommerce_order_id ON public.ecommerce_order_items(ecommerce_order_id);
CREATE INDEX IF NOT EXISTS idx_ecommerce_order_items_internal_product_id ON public.ecommerce_order_items(internal_product_id);

-- 4. Ecommerce Tracking Events Table
CREATE TABLE IF NOT EXISTS public.ecommerce_tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ecommerce_order_id UUID NOT NULL REFERENCES public.ecommerce_orders(id) ON DELETE CASCADE,
  
  -- Event info
  tracking_code VARCHAR(50) NOT NULL, -- F980, F600, etc.
  tracking_name VARCHAR(100) NOT NULL, -- 'Delivered', 'Out For Delivery', etc.
  description TEXT,
  
  -- Milestone info
  milestone_code INT NOT NULL, -- 8 = Delivered
  milestone_name VARCHAR(100) NOT NULL,
  
  -- Timestamp
  actual_time TIMESTAMP WITH TIME ZONE NOT NULL, -- Unix timestamp converted
  
  -- Location info
  current_location_name VARCHAR(255),
  current_location_address TEXT,
  current_location_lat VARCHAR(50),
  current_location_lng VARCHAR(50),
  
  next_location_name VARCHAR(255),
  next_location_address TEXT,
  
  -- Metadata
  reason_code VARCHAR(10),
  reason_desc VARCHAR(100),
  display_flag INT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for ecommerce_tracking_events
CREATE INDEX IF NOT EXISTS idx_ecommerce_tracking_events_ecommerce_order_id ON public.ecommerce_tracking_events(ecommerce_order_id);
CREATE INDEX IF NOT EXISTS idx_ecommerce_tracking_events_milestone_code ON public.ecommerce_tracking_events(milestone_code);
CREATE INDEX IF NOT EXISTS idx_ecommerce_tracking_events_actual_time ON public.ecommerce_tracking_events(actual_time DESC);

-- Trigger: Update ecommerce_orders.updated_at
CREATE OR REPLACE FUNCTION update_ecommerce_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists (idempotent)
DROP TRIGGER IF EXISTS trigger_update_ecommerce_orders_updated_at ON public.ecommerce_orders;

CREATE TRIGGER trigger_update_ecommerce_orders_updated_at
BEFORE UPDATE ON public.ecommerce_orders
FOR EACH ROW
EXECUTE FUNCTION update_ecommerce_orders_updated_at();

-- Trigger: Update ecommerce_platforms.updated_at
CREATE OR REPLACE FUNCTION update_ecommerce_platforms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists (idempotent)
DROP TRIGGER IF EXISTS trigger_update_ecommerce_platforms_updated_at ON public.ecommerce_platforms;

CREATE TRIGGER trigger_update_ecommerce_platforms_updated_at
BEFORE UPDATE ON public.ecommerce_platforms
FOR EACH ROW
EXECUTE FUNCTION update_ecommerce_platforms_updated_at();

-- Trigger: Calculate total_amount from items
CREATE OR REPLACE FUNCTION calculate_ecommerce_order_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.ecommerce_orders
  SET total_amount = (
    SELECT COALESCE(SUM(total_price), 0)
    FROM public.ecommerce_order_items
    WHERE ecommerce_order_id = COALESCE(NEW.ecommerce_order_id, OLD.ecommerce_order_id)
  )
  WHERE id = COALESCE(NEW.ecommerce_order_id, OLD.ecommerce_order_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists (idempotent)
DROP TRIGGER IF EXISTS trigger_calculate_ecommerce_order_total ON public.ecommerce_order_items;

CREATE TRIGGER trigger_calculate_ecommerce_order_total
AFTER INSERT OR UPDATE OR DELETE ON public.ecommerce_order_items
FOR EACH ROW
EXECUTE FUNCTION calculate_ecommerce_order_total();

-- Seed: Ecommerce Platforms
INSERT INTO public.ecommerce_platforms (name, code, tracking_api_type, is_active) VALUES
  ('Shopee', 'shopee', 'rest_api', TRUE),
  ('TikTok Shop', 'tiktok', 'web_scrape', TRUE),
  ('J&T Express', 'jt', 'web_scrape', TRUE),
  ('GHN', 'ghn', 'rest_api', TRUE)
ON CONFLICT (code) DO NOTHING;

-- Enable RLS
ALTER TABLE public.ecommerce_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecommerce_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecommerce_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecommerce_tracking_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Admin only
-- Drop existing policies if exists (idempotent)
DROP POLICY IF EXISTS "Admins can manage ecommerce_platforms" ON public.ecommerce_platforms;
DROP POLICY IF EXISTS "Admins can manage ecommerce_orders" ON public.ecommerce_orders;
DROP POLICY IF EXISTS "Admins can manage ecommerce_order_items" ON public.ecommerce_order_items;
DROP POLICY IF EXISTS "Admins can manage ecommerce_tracking_events" ON public.ecommerce_tracking_events;

CREATE POLICY "Admins can manage ecommerce_platforms"
ON public.ecommerce_platforms
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage ecommerce_orders"
ON public.ecommerce_orders
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage ecommerce_order_items"
ON public.ecommerce_order_items
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage ecommerce_tracking_events"
ON public.ecommerce_tracking_events
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Comments
COMMENT ON TABLE public.ecommerce_platforms IS 'Danh sách các sàn thương mại điện tử';
COMMENT ON TABLE public.ecommerce_orders IS 'Đơn hàng từ các sàn TMĐT (Shopee, TikTok Shop)';
COMMENT ON TABLE public.ecommerce_order_items IS 'Chi tiết sản phẩm trong đơn hàng TMĐT';
COMMENT ON TABLE public.ecommerce_tracking_events IS 'Lịch sử tracking events từ API';

COMMENT ON COLUMN public.ecommerce_orders.tracking_code IS 'Mã vận đơn (VD: SPXVN05389608535C)';
COMMENT ON COLUMN public.ecommerce_orders.last_milestone_code IS 'Milestone code mới nhất (8 = Delivered)';
COMMENT ON COLUMN public.ecommerce_orders.total_amount IS 'Tổng tiền tự động tính từ ecommerce_order_items';
COMMENT ON COLUMN public.ecommerce_order_items.unit_price IS 'Giá bán (admin nhập khi chọn sản phẩm)';
COMMENT ON COLUMN public.ecommerce_order_items.total_price IS 'Tổng tiền = unit_price * quantity';

