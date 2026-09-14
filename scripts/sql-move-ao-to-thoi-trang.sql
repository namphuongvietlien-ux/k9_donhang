-- Chuyển nhanh các mã đang ở nhóm "Khác" có chữ "áo" trong tên sang
-- Ngành TT (Thời trang) · Nhóm chi tiết AQ (Áo quần) — giống thao tác "Đổi nhóm SKU".
-- Chạy trên Supabase SQL Editor. Bước 1 xem trước, ưng rồi mới chạy bước 2.
--
-- "Nhóm Khác" = sku_industry trống / không phải mã ngành hợp lệ.
-- Khớp "áo" theo từ nguyên vẹn (Áo Baby Dog, áo yếm, Bộ áo…) — không bắt "cháo", "táo", "cáo".
-- Loại trừ tên có "nệm/thảm/bọc/vỏ/ga/gối/chuồng" để không kéo đồ nệm-vỏ-áo-ghế sang thời trang.

-- ── Bước 1: xem trước
SELECT slug, name, sku_industry, sku_detail, category_group
FROM public.products
WHERE (sku_industry IS NULL
       OR upper(trim(sku_industry)) NOT IN ('TA','VS','DC','YT','TT','PK','VT','DV'))
  AND lower(name) ~ '(^|[^[:alpha:]])áo([^[:alpha:]]|$)'
  AND lower(name) !~ '(nệm|thảm|bọc|vỏ |vỏ$|gối|chuồng|lồng)'
ORDER BY name;

-- ── Bước 2: cập nhật (chạy sau khi kiểm tra danh sách ở bước 1)
UPDATE public.products
SET sku_industry = 'TT',
    sku_detail   = 'AQ',
    category_group = COALESCE(category_group, 'HANG_HOA'),
    updated_at = now()
WHERE (sku_industry IS NULL
       OR upper(trim(sku_industry)) NOT IN ('TA','VS','DC','YT','TT','PK','VT','DV'))
  AND lower(name) ~ '(^|[^[:alpha:]])áo([^[:alpha:]]|$)'
  AND lower(name) !~ '(nệm|thảm|bọc|vỏ |vỏ$|gối|chuồng|lồng)';

-- ── Kiểm tra lại
SELECT count(*) AS so_ma_thoi_trang_ao_quan
FROM public.products
WHERE sku_industry = 'TT' AND sku_detail = 'AQ';

-- ── (Tuỳ chọn) Các mã HV nhóm HPKAQU/CPKAQU/MPKAQU (Áo quần) chưa gán ngành → gán TT/AQ luôn,
--    kể cả mã biến thể dạng HPKAQU1026-01.
UPDATE public.products
SET sku_industry = 'TT',
    sku_detail   = 'AQ',
    category_group = COALESCE(category_group, 'HANG_HOA'),
    updated_at = now()
WHERE (sku_industry IS NULL
       OR upper(trim(sku_industry)) NOT IN ('TA','VS','DC','YT','TT','PK','VT','DV'))
  AND upper(split_part(slug, '-', 1)) ~ '^[CMH]PKAQU[0-9]{4}$';
