-- Seed shipping rates based on SPX Express pricing table
-- Nội tỉnh (INTRA_PROVINCE)
INSERT INTO public.shipping_rates (zone_type, weight_from, weight_to, base_price, additional_price_per_500g) VALUES
  ('INTRA_PROVINCE', 0, 1, 18000, NULL),
  ('INTRA_PROVINCE', 1, 1.5, 20500, NULL),
  ('INTRA_PROVINCE', 1.5, 2, 23000, NULL),
  ('INTRA_PROVINCE', 2, NULL, 23000, 2500)
ON CONFLICT (zone_type, weight_from, weight_to) DO UPDATE
SET base_price = EXCLUDED.base_price,
    additional_price_per_500g = EXCLUDED.additional_price_per_500g;

-- Nội miền (INTRA_REGION)
INSERT INTO public.shipping_rates (zone_type, weight_from, weight_to, base_price, additional_price_per_500g) VALUES
  ('INTRA_REGION', 0, 1, 22000, NULL),
  ('INTRA_REGION', 1, 1.5, 24500, NULL),
  ('INTRA_REGION', 1.5, 2, 27000, NULL),
  ('INTRA_REGION', 2, NULL, 27000, 2500)
ON CONFLICT (zone_type, weight_from, weight_to) DO UPDATE
SET base_price = EXCLUDED.base_price,
    additional_price_per_500g = EXCLUDED.additional_price_per_500g;

-- Đặc biệt (SPECIAL: Hà Nội ↔ TP.HCM ↔ Đà Nẵng)
INSERT INTO public.shipping_rates (zone_type, weight_from, weight_to, base_price, additional_price_per_500g) VALUES
  ('SPECIAL', 0, 1, 22000, NULL),
  ('SPECIAL', 1, 1.5, 27000, NULL),
  ('SPECIAL', 1.5, 2, 30000, NULL),
  ('SPECIAL', 2, NULL, 30000, 5000)
ON CONFLICT (zone_type, weight_from, weight_to) DO UPDATE
SET base_price = EXCLUDED.base_price,
    additional_price_per_500g = EXCLUDED.additional_price_per_500g;

-- Liên miền (INTER_REGION)
INSERT INTO public.shipping_rates (zone_type, weight_from, weight_to, base_price, additional_price_per_500g) VALUES
  ('INTER_REGION', 0, 1, 22000, NULL),
  ('INTER_REGION', 1, 1.5, 27000, NULL),
  ('INTER_REGION', 1.5, 2, 30000, NULL),
  ('INTER_REGION', 2, NULL, 30000, 5000)
ON CONFLICT (zone_type, weight_from, weight_to) DO UPDATE
SET base_price = EXCLUDED.base_price,
    additional_price_per_500g = EXCLUDED.additional_price_per_500g;

