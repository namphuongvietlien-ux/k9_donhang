-- =====================================================
-- INVENTORY CONSISTENCY CHECK
-- Kiểm tra tính nhất quán tồn kho giữa:
--   - stock_in_items (nhập)
--   - stock_out_items (xuất)
--   - inventory_lots (tồn theo lô)
--   - products.stock_quantity (tồn hiện tại)
-- =====================================================

-- 1. View: Tổng hợp tồn kho theo product từ chứng từ nhập/xuất
CREATE OR REPLACE VIEW v_inventory_io_per_product AS
SELECT
  p.id AS product_id,
  p.name AS product_name,
  p.slug AS product_slug,
  COALESCE(SUM(sii.quantity), 0) AS total_qty_in,          -- Tổng nhập
  COALESCE(SUM(soi.quantity), 0) AS total_qty_out,         -- Tổng xuất
  COALESCE(SUM(sii.quantity), 0) - COALESCE(SUM(soi.quantity), 0) AS qty_in_minus_out
FROM public.products p
LEFT JOIN public.stock_in_items sii ON sii.product_id = p.id
LEFT JOIN public.stock_out_items soi ON soi.product_id = p.id
GROUP BY
  p.id,
  p.name,
  p.slug;

COMMENT ON VIEW v_inventory_io_per_product IS
  'Tổng hợp tồn kho theo product dựa trên chứng từ nhập (stock_in_items) và xuất (stock_out_items).';

-- 2. View: Tổng hợp tồn kho theo product từ inventory_lots (tồn chi tiết theo lô)
CREATE OR REPLACE VIEW v_inventory_lots_per_product AS
SELECT
  p.id AS product_id,
  p.name AS product_name,
  p.slug AS product_slug,
  COALESCE(SUM(il.quantity), 0) AS total_qty_in_lots
FROM public.products p
LEFT JOIN public.inventory_lots il ON il.product_id = p.id
GROUP BY
  p.id,
  p.name,
  p.slug;

COMMENT ON VIEW v_inventory_lots_per_product IS
  'Tổng hợp tồn kho theo product dựa trên inventory_lots (tồn chi tiết theo lô).';

-- 3. View: Đối chiếu tổng nhập/xuất, tồn theo lô và products.stock_quantity
CREATE OR REPLACE VIEW v_inventory_consistency AS
SELECT
  p.id AS product_id,
  p.name AS product_name,
  p.slug AS product_slug,

  -- Tồn theo products table
  p.stock_quantity AS stock_in_products,

  -- Tồn theo chứng từ nhập/xuất
  io.total_qty_in,
  io.total_qty_out,
  io.qty_in_minus_out AS stock_by_io,

  -- Tồn theo inventory_lots
  lots.total_qty_in_lots AS stock_by_lots,

  -- Chênh lệch
  (io.qty_in_minus_out - p.stock_quantity) AS diff_products_vs_io,
  (lots.total_qty_in_lots - p.stock_quantity) AS diff_products_vs_lots,
  (io.qty_in_minus_out - lots.total_qty_in_lots) AS diff_io_vs_lots
FROM public.products p
LEFT JOIN v_inventory_io_per_product io
  ON io.product_id = p.id
LEFT JOIN v_inventory_lots_per_product lots
  ON lots.product_id = p.id;

COMMENT ON VIEW v_inventory_consistency IS
  'Đối chiếu tồn kho: products.stock_quantity vs (nhập - xuất) vs inventory_lots.';

-- 4. Query tổng hợp: thống kê số sản phẩm lệch
-- (Chỉ chạy SELECT, không tạo object mới)
-- Ví dụ chạy trong SQL Editor:
--   SELECT * FROM v_inventory_consistency_summary;
CREATE OR REPLACE VIEW v_inventory_consistency_summary AS
SELECT
  COUNT(*) AS total_products,
  COUNT(*) FILTER (WHERE diff_products_vs_io <> 0) AS products_mismatch_products_vs_io,
  COUNT(*) FILTER (WHERE diff_products_vs_lots <> 0) AS products_mismatch_products_vs_lots,
  COUNT(*) FILTER (WHERE diff_io_vs_lots <> 0) AS products_mismatch_io_vs_lots
FROM v_inventory_consistency;

COMMENT ON VIEW v_inventory_consistency_summary IS
  'Thống kê số sản phẩm đang có chênh lệch tồn kho giữa các nguồn.';

-- 5. Gợi ý các truy vấn kiểm tra chi tiết (chạy tay trong SQL Editor)
-- 5.1. Xem các sản phẩm có chênh lệch giữa products và (nhập - xuất)
-- SELECT *
-- FROM v_inventory_consistency
-- WHERE diff_products_vs_io <> 0
-- ORDER BY ABS(diff_products_vs_io) DESC, product_name;
--
-- 5.2. Xem các sản phẩm có chênh lệch giữa products và inventory_lots
-- SELECT *
-- FROM v_inventory_consistency
-- WHERE diff_products_vs_lots <> 0
-- ORDER BY ABS(diff_products_vs_lots) DESC, product_name;
--
-- 5.3. Xem các sản phẩm có chênh lệch giữa (nhập - xuất) và inventory_lots
-- SELECT *
-- FROM v_inventory_consistency
-- WHERE diff_io_vs_lots <> 0
-- ORDER BY ABS(diff_io_vs_lots) DESC, product_name;

-- 6. Gợi ý: Check nhanh toàn hệ thống
-- SELECT * FROM v_inventory_consistency_summary;

-- 7. Lưu ý:
-- - Nếu chỉ một nguồn bị lệch, có thể truy dấu theo từng product_id.
-- - Nên chạy script này sau khi đã sửa xong logic nhập/xuất để đánh giá chất lượng dữ liệu lịch sử.

