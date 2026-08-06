-- Seed shipping zones
INSERT INTO public.shipping_zones (name, code, description) VALUES
  ('Miền Bắc', 'NORTH', 'Các tỉnh, thành phố ở phía bắc tỉnh Thanh Hóa'),
  ('Miền Trung', 'CENTRAL', 'Các tỉnh duyên hải từ Thanh Hóa tới Bình Thuận và các tỉnh Tây Nguyên'),
  ('Miền Nam', 'SOUTH', 'Các tỉnh Đông Nam Bộ và khu vực Đồng bằng sông Cửu Long')
ON CONFLICT (code) DO NOTHING;

-- Seed provinces (63 tỉnh/thành phố)
-- Miền Bắc
INSERT INTO public.provinces (name, code, zone_id, is_special) VALUES
  ('Hà Nội', 'HANOI', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), true),
  ('Hải Phòng', 'HAIPHONG', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Quảng Ninh', 'QUANGNINH', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Bắc Giang', 'BACGIANG', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Bắc Ninh', 'BACNINH', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Hải Dương', 'HAIDUONG', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Hưng Yên', 'HUNGYEN', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Thái Bình', 'THAIBINH', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Hà Nam', 'HANAM', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Nam Định', 'NAMDINH', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Ninh Bình', 'NINHBINH', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Vĩnh Phúc', 'VINHPHUC', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Phú Thọ', 'PHUTHO', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Thái Nguyên', 'THAINGUYEN', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Lào Cai', 'LAOCAI', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Yên Bái', 'YENBAI', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Tuyên Quang', 'TUYENQUANG', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Hà Giang', 'HAGIANG', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Cao Bằng', 'CAOBANG', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Bắc Kạn', 'BACKAN', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Lạng Sơn', 'LANGSON', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Điện Biên', 'DIENBIEN', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Sơn La', 'SONLA', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Hòa Bình', 'HOABINH', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false),
  ('Thanh Hóa', 'THANHHOA', (SELECT id FROM public.shipping_zones WHERE code = 'NORTH'), false)
ON CONFLICT (code) DO NOTHING;

-- Miền Trung
INSERT INTO public.provinces (name, code, zone_id, is_special) VALUES
  ('Nghệ An', 'NGHEAN', (SELECT id FROM public.shipping_zones WHERE code = 'CENTRAL'), false),
  ('Hà Tĩnh', 'HATINH', (SELECT id FROM public.shipping_zones WHERE code = 'CENTRAL'), false),
  ('Quảng Bình', 'QUANGBINH', (SELECT id FROM public.shipping_zones WHERE code = 'CENTRAL'), false),
  ('Quảng Trị', 'QUANGTRI', (SELECT id FROM public.shipping_zones WHERE code = 'CENTRAL'), false),
  ('Thừa Thiên Huế', 'HUE', (SELECT id FROM public.shipping_zones WHERE code = 'CENTRAL'), false),
  ('Đà Nẵng', 'DANANG', (SELECT id FROM public.shipping_zones WHERE code = 'CENTRAL'), true),
  ('Quảng Nam', 'QUANGNAM', (SELECT id FROM public.shipping_zones WHERE code = 'CENTRAL'), false),
  ('Quảng Ngãi', 'QUANGNGAI', (SELECT id FROM public.shipping_zones WHERE code = 'CENTRAL'), false),
  ('Bình Định', 'BINHDINH', (SELECT id FROM public.shipping_zones WHERE code = 'CENTRAL'), false),
  ('Phú Yên', 'PHUYEN', (SELECT id FROM public.shipping_zones WHERE code = 'CENTRAL'), false),
  ('Khánh Hòa', 'KHANHHOA', (SELECT id FROM public.shipping_zones WHERE code = 'CENTRAL'), false),
  ('Ninh Thuận', 'NINHTHUAN', (SELECT id FROM public.shipping_zones WHERE code = 'CENTRAL'), false),
  ('Bình Thuận', 'BINHTHUAN', (SELECT id FROM public.shipping_zones WHERE code = 'CENTRAL'), false),
  ('Kon Tum', 'KONTUM', (SELECT id FROM public.shipping_zones WHERE code = 'CENTRAL'), false),
  ('Gia Lai', 'GIALAI', (SELECT id FROM public.shipping_zones WHERE code = 'CENTRAL'), false),
  ('Đắk Lắk', 'DAKLAK', (SELECT id FROM public.shipping_zones WHERE code = 'CENTRAL'), false),
  ('Đắk Nông', 'DAKNONG', (SELECT id FROM public.shipping_zones WHERE code = 'CENTRAL'), false),
  ('Lâm Đồng', 'LAMDONG', (SELECT id FROM public.shipping_zones WHERE code = 'CENTRAL'), false)
ON CONFLICT (code) DO NOTHING;

-- Miền Nam
INSERT INTO public.provinces (name, code, zone_id, is_special) VALUES
  ('TP. Hồ Chí Minh', 'HCM', (SELECT id FROM public.shipping_zones WHERE code = 'SOUTH'), true),
  ('Bình Phước', 'BINHPHUOC', (SELECT id FROM public.shipping_zones WHERE code = 'SOUTH'), false),
  ('Bình Dương', 'BINHDUONG', (SELECT id FROM public.shipping_zones WHERE code = 'SOUTH'), false),
  ('Đồng Nai', 'DONGNAI', (SELECT id FROM public.shipping_zones WHERE code = 'SOUTH'), false),
  ('Tây Ninh', 'TAYNINH', (SELECT id FROM public.shipping_zones WHERE code = 'SOUTH'), false),
  ('Bà Rịa - Vũng Tàu', 'BARIAVUNGTAU', (SELECT id FROM public.shipping_zones WHERE code = 'SOUTH'), false),
  ('Long An', 'LONGAN', (SELECT id FROM public.shipping_zones WHERE code = 'SOUTH'), false),
  ('Tiền Giang', 'TIENGIANG', (SELECT id FROM public.shipping_zones WHERE code = 'SOUTH'), false),
  ('Bến Tre', 'BENTRE', (SELECT id FROM public.shipping_zones WHERE code = 'SOUTH'), false),
  ('Trà Vinh', 'TRAVINH', (SELECT id FROM public.shipping_zones WHERE code = 'SOUTH'), false),
  ('Vĩnh Long', 'VINHLONG', (SELECT id FROM public.shipping_zones WHERE code = 'SOUTH'), false),
  ('Đồng Tháp', 'DONGTHAP', (SELECT id FROM public.shipping_zones WHERE code = 'SOUTH'), false),
  ('An Giang', 'ANGIANG', (SELECT id FROM public.shipping_zones WHERE code = 'SOUTH'), false),
  ('Kiên Giang', 'KIENGIANG', (SELECT id FROM public.shipping_zones WHERE code = 'SOUTH'), false),
  ('Cần Thơ', 'CANTHO', (SELECT id FROM public.shipping_zones WHERE code = 'SOUTH'), false),
  ('Hậu Giang', 'HAUGIANG', (SELECT id FROM public.shipping_zones WHERE code = 'SOUTH'), false),
  ('Sóc Trăng', 'SOCTRANG', (SELECT id FROM public.shipping_zones WHERE code = 'SOUTH'), false),
  ('Bạc Liêu', 'BACLIEU', (SELECT id FROM public.shipping_zones WHERE code = 'SOUTH'), false),
  ('Cà Mau', 'CAMAU', (SELECT id FROM public.shipping_zones WHERE code = 'SOUTH'), false)
ON CONFLICT (code) DO NOTHING;

