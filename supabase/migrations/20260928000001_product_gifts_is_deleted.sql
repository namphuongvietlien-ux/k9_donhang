-- Xóa mềm quy tắc hàng tặng kèm: thêm cột is_deleted.
-- true = đã ẩn khỏi danh sách và không áp dụng cho phiếu mới.

ALTER TABLE public.product_gifts
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

-- Index phục vụ lọc các quy tắc còn hiệu lực (chưa xóa mềm).
CREATE INDEX IF NOT EXISTS idx_product_gifts_not_deleted
  ON public.product_gifts (main_product_id)
  WHERE is_deleted = false;

COMMENT ON COLUMN public.product_gifts.is_deleted IS
  'Xóa mềm: true = đã ẩn khỏi danh sách, không áp dụng cho phiếu mới (đi kèm is_active=false).';

NOTIFY pgrst, 'reload schema';
