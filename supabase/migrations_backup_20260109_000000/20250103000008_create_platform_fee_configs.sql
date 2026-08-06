-- =====================================================
-- PLATFORM FEE CONFIGURATION SYSTEM
-- =====================================================
-- Hệ thống lưu trữ cấu hình phí sàn linh hoạt
-- Cho phép admin thay đổi phí và thêm phí mới mà không cần sửa code
-- =====================================================

BEGIN;

-- Bảng định nghĩa các loại phí (có thể thêm mới động)
CREATE TABLE IF NOT EXISTS public.platform_fee_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_code TEXT NOT NULL, -- 'shopee', 'tiktok', 'ghn', etc.
  fee_key TEXT NOT NULL, -- 'paymentFeeRate', 'fixedFeeRate', 'transactionFeeRate', etc.
  fee_name TEXT NOT NULL, -- Tên hiển thị: 'Phí thanh toán', 'Phí cố định', etc.
  fee_type TEXT NOT NULL DEFAULT 'percentage', -- 'percentage' hoặc 'fixed_amount'
  fee_unit TEXT DEFAULT '%', -- '%' hoặc 'VND'
  description TEXT, -- Mô tả về loại phí
  display_order INTEGER DEFAULT 0, -- Thứ tự hiển thị
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform_code, fee_key)
);

-- Bảng lưu giá trị cấu hình phí
CREATE TABLE IF NOT EXISTS public.platform_fee_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_code TEXT NOT NULL, -- 'shopee', 'tiktok', 'ghn', etc.
  fee_key TEXT NOT NULL, -- Key của loại phí
  fee_value DECIMAL(12, 4) NOT NULL, -- Giá trị phí
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform_code, fee_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_platform_fee_types_platform ON public.platform_fee_types(platform_code, is_active);
CREATE INDEX IF NOT EXISTS idx_platform_fee_configs_platform ON public.platform_fee_configs(platform_code, is_active);

-- RLS Policies
ALTER TABLE public.platform_fee_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fee_configs ENABLE ROW LEVEL SECURITY;

-- Policies: Anyone can view, only admins can modify
CREATE POLICY "Anyone can view fee types"
  ON public.platform_fee_types FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage fee types"
  ON public.platform_fee_types FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view fee configs"
  ON public.platform_fee_configs FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage fee configs"
  ON public.platform_fee_configs FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Trigger để cập nhật updated_at
CREATE TRIGGER update_platform_fee_types_updated_at
  BEFORE UPDATE ON public.platform_fee_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_platform_fee_configs_updated_at
  BEFORE UPDATE ON public.platform_fee_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default fee types cho Shopee
INSERT INTO public.platform_fee_types (platform_code, fee_key, fee_name, fee_type, fee_unit, description, display_order) VALUES
  ('shopee', 'paymentFeeRate', 'Phí thanh toán', 'percentage', '%', 'Phí thanh toán trên tổng giá trị đơn hàng', 1),
  ('shopee', 'fixedFeeRate', 'Phí cố định', 'percentage', '%', 'Phí cố định trên giá bán sản phẩm', 2),
  ('shopee', 'voucherXtraRate', 'Voucher Xtra', 'percentage', '%', 'Phí Voucher Xtra (giới hạn 20,000đ/sản phẩm)', 3),
  ('shopee', 'infrastructureFee', 'Phí hạ tầng', 'fixed_amount', 'VND', 'Phí hạ tầng cố định mỗi đơn hàng', 4),
  ('shopee', 'piShipFee', 'Phí PiShip', 'fixed_amount', 'VND', 'Phí PiShip cố định mỗi đơn hàng', 5),
  ('shopee', 'vatRate', 'Thuế GTGT', 'percentage', '%', 'Thuế giá trị gia tăng', 6),
  ('shopee', 'pitRate', 'Thuế TNCN', 'percentage', '%', 'Thuế thu nhập cá nhân', 7)
ON CONFLICT (platform_code, fee_key) DO NOTHING;

-- Insert default fee types cho TikTok
INSERT INTO public.platform_fee_types (platform_code, fee_key, fee_name, fee_type, fee_unit, description, display_order) VALUES
  ('tiktok', 'transactionFeeRate', 'Phí giao dịch', 'percentage', '%', 'Phí giao dịch trên tổng giá trị đơn hàng (bao gồm ship)', 1),
  ('tiktok', 'commissionRate', 'Hoa hồng sàn', 'percentage', '%', 'Hoa hồng sàn trên giá bán sản phẩm (theo ngành hàng)', 2),
  ('tiktok', 'affiliateRate', 'Hoa hồng Affiliate', 'percentage', '%', 'Hoa hồng đối tác tiếp thị', 3),
  ('tiktok', 'voucherXtraRate', 'Voucher Xtra', 'percentage', '%', 'Phí Voucher Xtra', 4),
  ('tiktok', 'processingFee', 'Phí xử lý đơn', 'fixed_amount', 'VND', 'Phí xử lý đơn hàng cố định', 5),
  ('tiktok', 'sfrRate', 'Phí SFR', 'percentage', '%', 'Phí dịch vụ SFR (Service Fee Rate)', 6),
  ('tiktok', 'vatRate', 'Thuế GTGT', 'percentage', '%', 'Thuế giá trị gia tăng', 7),
  ('tiktok', 'pitRate', 'Thuế TNCN', 'percentage', '%', 'Thuế thu nhập cá nhân', 8)
ON CONFLICT (platform_code, fee_key) DO NOTHING;

-- Insert default fee configs cho Shopee
INSERT INTO public.platform_fee_configs (platform_code, fee_key, fee_value) VALUES
  ('shopee', 'paymentFeeRate', 4.91),
  ('shopee', 'fixedFeeRate', 11.29),
  ('shopee', 'voucherXtraRate', 3.00),
  ('shopee', 'infrastructureFee', 3000),
  ('shopee', 'piShipFee', 1620),
  ('shopee', 'vatRate', 1.00),
  ('shopee', 'pitRate', 0.50)
ON CONFLICT (platform_code, fee_key) DO UPDATE SET fee_value = EXCLUDED.fee_value;

-- Insert default fee configs cho TikTok
INSERT INTO public.platform_fee_configs (platform_code, fee_key, fee_value) VALUES
  ('tiktok', 'transactionFeeRate', 5.00),
  ('tiktok', 'commissionRate', 11.29),
  ('tiktok', 'affiliateRate', 15.00),
  ('tiktok', 'voucherXtraRate', 3.00),
  ('tiktok', 'processingFee', 3000),
  ('tiktok', 'sfrRate', 1.57),
  ('tiktok', 'vatRate', 1.00),
  ('tiktok', 'pitRate', 0.50)
ON CONFLICT (platform_code, fee_key) DO UPDATE SET fee_value = EXCLUDED.fee_value;

COMMIT;

