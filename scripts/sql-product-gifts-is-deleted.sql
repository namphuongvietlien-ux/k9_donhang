-- =====================================================================
-- Chạy trên Supabase SQL Editor để thêm cột xóa mềm cho product_gifts.
-- An toàn chạy lại nhiều lần (IF NOT EXISTS).
-- =====================================================================

ALTER TABLE public.product_gifts
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_product_gifts_not_deleted
  ON public.product_gifts (main_product_id)
  WHERE is_deleted = false;

COMMENT ON COLUMN public.product_gifts.is_deleted IS
  'Xóa mềm: true = đã ẩn khỏi danh sách, không áp dụng cho phiếu mới (đi kèm is_active=false).';

-- Bắt PostgREST nạp lại schema cache để REST API nhận cột mới ngay.
NOTIFY pgrst, 'reload schema';
