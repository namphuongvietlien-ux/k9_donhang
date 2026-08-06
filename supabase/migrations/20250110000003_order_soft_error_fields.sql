-- Soft-error flags for warehouse orders (PRD K9)
-- has_error / coLoiCanDieuChinh + line_notes trên order_items

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS has_error BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.orders.has_error IS
  'PRD: coLoiCanDieuChinh — có dòng Lỗi SL / Lỗi ĐVT / Mã không tồn tại';

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS line_notes TEXT;

COMMENT ON COLUMN public.order_items.line_notes IS
  'Ghi chú mềm từng dòng: Lỗi SL; Lỗi ĐVT; Mã không tồn tại';

-- Alias semantic: duplicate_accepted = duplicate_acknowledged (PRD)
COMMENT ON COLUMN public.orders.duplicate_accepted IS
  'PRD duplicate_acknowledged — user chấp nhận lưu khi phát hiện trùng ≤5 phút';
