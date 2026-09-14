-- Chỉ ngành Y tế (YT = y tế / thuốc) mới là THUOC.
-- Tất cả hàng hóa còn lại (TA thức ăn, VS vệ sinh, DC đồ chơi, TT thời trang,
-- PK phụ kiện, VT vật tư phòng khám, …) đều là HANG_HOA.
-- Giữ nguyên DICH_VU (dịch vụ phòng khám — không nhập vào phiếu).

UPDATE public.products AS p
SET category_group = CASE
    -- Cột ngành 2 ký tự đã chuẩn hóa từ SKU 10 ký tự
    WHEN upper(coalesce(p.sku_industry, '')) = 'YT' THEN 'THUOC'
    -- SKU cũ 6 chữ + 4 số: 2 ký tự đầu là mã ngành
    WHEN coalesce(p.sku_industry, '') = ''
         AND upper(p.slug) ~ '^[A-Z]{6}[0-9]{4}$'
         AND upper(left(p.slug, 2)) = 'YT' THEN 'THUOC'
    -- SKU HV 10 ký tự chưa gán ngành: nhóm hàng CN (chức năng) / ĐT (điều trị) = Y tế
    WHEN coalesce(p.sku_industry, '') = ''
         AND upper(p.slug) ~* '^[CMH][A-ZĐ]{2}[A-ZĐ]{3}[0-9]{4}$'
         AND upper(substring(p.slug from 2 for 2)) IN ('CN', 'DT', 'ĐT') THEN 'THUOC'
    ELSE 'HANG_HOA'
  END
WHERE coalesce(p.category_group, '') <> 'DICH_VU';

COMMENT ON COLUMN public.products.category_group IS
  'THUOC = chỉ ngành Y tế (YT — gồm thuốc / vắc xin / TPCN mang mã YT); HANG_HOA = mọi hàng hóa còn lại (kể cả vật tư y tế VT); DICH_VU = dịch vụ (không nhập vào phiếu).';

NOTIFY pgrst, 'reload schema';
