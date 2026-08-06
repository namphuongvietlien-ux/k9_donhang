-- Function to determine shipping zone type
CREATE OR REPLACE FUNCTION public.determine_shipping_zone_type(
  from_province_code TEXT,
  to_province_code TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  from_province RECORD;
  to_province RECORD;
  special_cities TEXT[] := ARRAY['HANOI', 'HCM', 'DANANG'];
BEGIN
  -- Get province info
  SELECT * INTO from_province FROM public.provinces WHERE code = from_province_code AND is_active = true;
  SELECT * INTO to_province FROM public.provinces WHERE code = to_province_code AND is_active = true;
  
  -- If provinces not found, return INTER_REGION (safest)
  IF from_province IS NULL OR to_province IS NULL THEN
    RETURN 'INTER_REGION';
  END IF;
  
  -- 1. Check if same province (Nội tỉnh)
  IF from_province.code = to_province.code THEN
    RETURN 'INTRA_PROVINCE';
  END IF;
  
  -- 2. Check if special cities (Hà Nội ↔ TP.HCM ↔ Đà Nẵng)
  IF from_province.code = ANY(special_cities) AND to_province.code = ANY(special_cities) THEN
    RETURN 'SPECIAL';
  END IF;
  
  -- 3. Check if same zone (Nội miền)
  IF from_province.zone_id = to_province.zone_id THEN
    RETURN 'INTRA_REGION';
  END IF;
  
  -- 4. Different zones (Liên miền)
  RETURN 'INTER_REGION';
END;
$$;

-- Function to calculate shipping fee
CREATE OR REPLACE FUNCTION public.calculate_shipping_fee(
  p_weight DECIMAL(10,2), -- Weight in kg
  p_from_province_code TEXT,
  p_to_province_code TEXT
)
RETURNS DECIMAL(12,0)
LANGUAGE plpgsql
AS $$
DECLARE
  v_zone_type TEXT;
  v_rate RECORD;
  v_base_price DECIMAL(12,0);
  v_additional_price DECIMAL(12,0);
  v_excess_weight DECIMAL(10,2);
  v_additional_500g INTEGER;
BEGIN
  -- Validate weight
  IF p_weight <= 0 THEN
    RETURN 0;
  END IF;
  
  -- Check weight limit (17kg)
  IF p_weight > 17 THEN
    -- Return NULL to indicate exceeds limit (admin will handle manually)
    RETURN NULL;
  END IF;
  
  -- Determine zone type
  v_zone_type := public.determine_shipping_zone_type(p_from_province_code, p_to_province_code);
  
  -- Find matching rate
  -- First, try to find exact match
  SELECT * INTO v_rate
  FROM public.shipping_rates
  WHERE zone_type = v_zone_type
    AND is_active = true
    AND p_weight >= weight_from
    AND (weight_to IS NULL OR p_weight <= weight_to)
  ORDER BY weight_from DESC
  LIMIT 1;
  
  -- If not found, use the base rate for weight >= 2kg
  IF v_rate IS NULL THEN
    SELECT * INTO v_rate
    FROM public.shipping_rates
    WHERE zone_type = v_zone_type
      AND is_active = true
      AND weight_from = 2
      AND weight_to IS NULL
    LIMIT 1;
  END IF;
  
  -- If still not found, return 0 (should not happen)
  IF v_rate IS NULL THEN
    RETURN 0;
  END IF;
  
  v_base_price := v_rate.base_price;
  
  -- Calculate additional fee for weight > 2kg
  IF v_rate.additional_price_per_500g IS NOT NULL AND p_weight > 2 THEN
    v_excess_weight := p_weight - 2;
    v_additional_500g := CEIL(v_excess_weight / 0.5);
    v_additional_price := v_additional_500g * v_rate.additional_price_per_500g;
  ELSE
    v_additional_price := 0;
  END IF;
  
  RETURN v_base_price + v_additional_price;
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.determine_shipping_zone_type IS 'Xác định loại khu vực vận chuyển dựa trên mã tỉnh gửi và nhận';
COMMENT ON FUNCTION public.calculate_shipping_fee IS 'Tính phí vận chuyển SPX Express dựa trên khối lượng và địa chỉ gửi/nhận. Trả về NULL nếu vượt quá 17kg.';

