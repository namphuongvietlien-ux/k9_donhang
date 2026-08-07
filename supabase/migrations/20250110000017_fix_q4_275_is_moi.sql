-- Đúng theo bảng địa chỉ K9:
-- KD 01 · Vĩnh Hội / 275 · code Q4_275 = Q4 Mới
-- KD 06 · 178 Hoàng Diệu · code Q4_178 = Q4 Cũ

UPDATE public.warehouses
SET
  short_name = 'Q4 Cũ',
  print_name = 'Q4 Cũ',
  name = 'Kho Địa điểm kinh doanh 06 (Q4 Cũ)',
  address = '178 đường Hoàng Diệu, Phường Khánh Hội, TPHCM'
WHERE code = 'Q4_178';

UPDATE public.warehouses
SET
  short_name = 'Q4 Mới',
  print_name = 'Q4 Mới',
  name = 'Kho Địa điểm kinh doanh 01 (Q4 Mới)',
  address = 'L22-24 Cư Xá Vĩnh Hội, đường Hoàng Diệu, phường Khánh Hội, TP Hồ Chí Minh, Việt Nam.'
WHERE code = 'Q4_275';

UPDATE public.warehouses
SET
  address = '269A đường Lê Văn Lương, P. Tân Hưng, TP.HCM, Việt Nam'
WHERE code = 'Q7';

UPDATE public.warehouses
SET
  address = '86A-88 đường Dương Bá Trạc, P. Chánh Hưng, TP.HCM'
WHERE code = 'Q8';

UPDATE public.warehouses
SET
  address = '237-239 Phạm Hùng, P.Chánh Hưng, TP.HCM'
WHERE code = 'PH';

UPDATE public.warehouses
SET
  address = '7 Trần Hưng Đạo, Phường An Đông, TP.Hồ Chí Minh'
WHERE code = 'Q5';

UPDATE public.warehouses
SET
  address = '140 đường Nguyễn Văn Cừ, P. Cầu Ông Lãnh, TP.HCM'
WHERE code = 'Q1';
