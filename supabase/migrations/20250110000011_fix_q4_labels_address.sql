-- Fix nhãn Q4 theo địa chỉ số nhà (override lần seed trước nếu sai)
UPDATE public.warehouses SET
  short_name = 'Q4 Cũ',
  print_name = 'Q4 Cũ',
  name = 'Q4 Cũ — 178 Hoàng Diệu',
  address = '178 Hoàng Diệu, Q.4, TP.HCM'
WHERE code = 'Q4_178';

UPDATE public.warehouses SET
  short_name = 'Q4 Mới',
  print_name = 'Q4 Mới',
  name = 'Q4 Mới — 275 Hoàng Diệu',
  address = '275 Hoàng Diệu, Q.4, TP.HCM'
WHERE code = 'Q4_275';

NOTIFY pgrst, 'reload schema';
