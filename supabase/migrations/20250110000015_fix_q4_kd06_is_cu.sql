-- Fix nhãn Q4 theo nghiệp vụ K9:
-- KD 06 (code Q4_275) = Q4 Cũ
-- KD 01 (code Q4_178) = Q4 Mới

UPDATE public.warehouses
SET
  short_name = 'Q4 Mới',
  print_name = 'Q4 Mới',
  name = 'Kho Địa điểm kinh doanh 01 (Q4 Mới)',
  address = '178 Hoàng Diệu, Q.4, TP.HCM'
WHERE code = 'Q4_178';

UPDATE public.warehouses
SET
  short_name = 'Q4 Cũ',
  print_name = 'Q4 Cũ',
  name = 'Kho Địa điểm kinh doanh 06 (Q4 Cũ)',
  address = '275 Hoàng Diệu, Q.4, TP.HCM'
WHERE code = 'Q4_275';
