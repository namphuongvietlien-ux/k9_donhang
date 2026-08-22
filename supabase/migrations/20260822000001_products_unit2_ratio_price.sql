-- Tỷ lệ quy đổi + giá bán theo ĐVT phụ (KiotViet "Danh sách hàng hóa" cột T / cột J).
--
-- File KiotViet xuất 2 dòng cho 1 mã hàng:
--   dòng gốc      : ĐVT cơ sở, Tỷ lệ quy đổi trống, Giá bán = giá ĐVT cơ sở
--   dòng quy đổi  : ĐVT lớn (Lọ/Hộp/Thùng), Tỷ lệ quy đổi = N, mã vạch riêng, giá riêng
--
-- Giá ĐVT lớn KHÔNG suy ra được bằng giá cơ sở × tỷ lệ (TCN2011: Gói 15.000 × 30
-- = 450.000 nhưng Hộp bán 420.000), nên phải lưu giá riêng cho ĐVT phụ.
-- Giữ mô hình unit/unit_2 sẵn có của products thay vì tạo bảng đơn vị song song.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unit_2_ratio numeric,
  ADD COLUMN IF NOT EXISTS price_2 numeric;

COMMENT ON COLUMN public.products.unit_2_ratio IS
  'Tỷ lệ quy đổi: 1 unit_2 = unit_2_ratio × unit (KiotViet cột T)';
COMMENT ON COLUMN public.products.price_2 IS
  'Giá bán theo unit_2 (KiotViet cột Giá bán của dòng quy đổi)';

NOTIFY pgrst, 'reload schema';
