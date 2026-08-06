-- Create shipping_zones table
CREATE TABLE IF NOT EXISTS public.shipping_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, -- "Miền Bắc", "Miền Trung", "Miền Nam"
  code TEXT UNIQUE NOT NULL, -- "NORTH", "CENTRAL", "SOUTH"
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create provinces table
CREATE TABLE IF NOT EXISTS public.provinces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, -- "Hà Nội", "TP. Hồ Chí Minh"
  code TEXT UNIQUE NOT NULL, -- "HANOI", "HCM"
  zone_id UUID REFERENCES public.shipping_zones(id) ON DELETE SET NULL,
  is_special BOOLEAN DEFAULT false, -- Hà Nội, TP.HCM, Đà Nẵng
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create shipping_rates table
CREATE TABLE IF NOT EXISTS public.shipping_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_type TEXT NOT NULL CHECK (zone_type IN ('INTRA_PROVINCE', 'INTRA_REGION', 'SPECIAL', 'INTER_REGION')),
  weight_from DECIMAL(10,2) NOT NULL,
  weight_to DECIMAL(10,2), -- NULL = không giới hạn
  base_price DECIMAL(12,0) NOT NULL,
  additional_price_per_500g DECIMAL(12,0), -- Giá mỗi 0.5kg tiếp theo (nếu có)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(zone_type, weight_from, weight_to)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_provinces_zone_id ON public.provinces(zone_id);
CREATE INDEX IF NOT EXISTS idx_provinces_code ON public.provinces(code);
CREATE INDEX IF NOT EXISTS idx_shipping_rates_zone_type ON public.shipping_rates(zone_type);
CREATE INDEX IF NOT EXISTS idx_shipping_rates_weight ON public.shipping_rates(weight_from, weight_to);

-- Enable RLS
ALTER TABLE public.shipping_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provinces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_rates ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Public read, Admin full access
CREATE POLICY "Anyone can view shipping zones"
ON public.shipping_zones FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage shipping zones"
ON public.shipping_zones FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view provinces"
ON public.provinces FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage provinces"
ON public.provinces FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view shipping rates"
ON public.shipping_rates FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage shipping rates"
ON public.shipping_rates FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Function to update updated_at
CREATE OR REPLACE FUNCTION public.update_shipping_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_shipping_zones_updated_at
BEFORE UPDATE ON public.shipping_zones
FOR EACH ROW
EXECUTE FUNCTION public.update_shipping_updated_at();

CREATE TRIGGER update_provinces_updated_at
BEFORE UPDATE ON public.provinces
FOR EACH ROW
EXECUTE FUNCTION public.update_shipping_updated_at();

CREATE TRIGGER update_shipping_rates_updated_at
BEFORE UPDATE ON public.shipping_rates
FOR EACH ROW
EXECUTE FUNCTION public.update_shipping_updated_at();

