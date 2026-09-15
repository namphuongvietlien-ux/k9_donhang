-- Mã cũ → mã mới (KiotViet/MISA báo "Mã hàng hóa và mã vạch không trùng khớp").
-- Yêu cầu đã chạy migration 20260915000001_auto_sku_code_mappings.sql.

-- 1) Xem trước: mã cũ nào ghép được mã mới (cùng mã vạch), mã nào nhiều ứng viên / không có
SELECT short_slug, short_name, long_slug, long_name, barcode, status, candidates, open_order_lines
FROM public.compute_sku_code_mappings()          -- dry run
ORDER BY status, short_slug;

-- 2) Áp dụng: ghi sku_code_mappings + khóa mã cũ (is_locked) + đổi mã trên phiếu đang mở
SELECT short_slug, long_slug, status, open_order_lines AS lines_updated
FROM public.compute_sku_code_mappings(false);

--    Nếu muốn ghép thêm theo tên (mã cũ không có mã vạch, tên trùng đúng 1 mã mới):
-- SELECT * FROM public.compute_sku_code_mappings(false, true, true);

-- 3) Mã cũ còn trên phiếu đang mở mà chưa có mã mới → xử lý tay bằng tab "5. Chuyển Mã Hàng"
--    (save_sku_code_mapping) hoặc tạo mã mới trong danh mục rồi chạy lại bước 2
SELECT * FROM public.v_sku_code_mapping_gaps;

-- 4) Kiểm tra một phiếu cụ thể
SELECT oi.product_slug, oi.barcode, oi.product_name, oi.quantity
FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
WHERE o.order_code = 'DH-449469';
