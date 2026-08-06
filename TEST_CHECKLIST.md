# TEST CHECKLIST - QUICK REFERENCE

**Ngày tạo:** 2025-01-XX  
**Mục đích:** Checklist nhanh để test hệ thống
  
  tại: /admin/accounts/receivable, mình thấy các cột như Khách hàng	Đơn hàng	Điện thoại, chưa được load đầy đủ hay sao 
---

## 🚀 QUICK SMOKE TEST (15 phút)

### Authentication
- [ ] Đăng ký tài khoản mới
- [ ] Đăng nhập Email/Password
- [ ] Đăng nhập Google OAuth
- [ ] Đăng xuất

### Public Pages
- [ ] Trang chủ load đúng
- [ ] Danh sách sản phẩm
- [ ] Chi tiết sản phẩm
- [ ] Thêm sản phẩm vào giỏ
- [ ] Checkout và đặt hàng (guest)

### Admin
- [ ] Đăng nhập admin
- [ ] Truy cập dashboard
- [ ] Tạo sản phẩm mới
- [ ] Tạo coupon mới (đã fix)
- [ ] Xem đơn hàng

---

## 🔴 CRITICAL PATH TEST (1 giờ)

### User Flow
- [ ] Đăng ký → Xem sản phẩm → Thêm giỏ → Checkout → Đặt hàng
- [ ] Tra cứu đơn hàng bằng mã đơn + số điện thoại
- [ ] Đăng nhập → Xem lịch sử đơn hàng

### Admin Flow
- [ ] Đăng nhập admin → Tạo sản phẩm → Upload hình
- [ ] Tạo đơn hàng test → Confirm đơn → Kiểm tra stock out
- [ ] Nhập kho → Kiểm tra tồn kho
- [ ] Xuất kho → Kiểm tra tồn kho giảm

### Security
- [ ] User thường không thể truy cập `/admin/*`
- [ ] User thường không thể INSERT/UPDATE/DELETE products
- [ ] Admin có thể quản lý tất cả

---

## ⚠️ KNOWN ISSUES TO CHECK

### RLS Policies
- [ ] ✅ Coupons: INSERT/UPDATE/DELETE hoạt động (đã fix)
- [ ] Flash Sales: INSERT/UPDATE/DELETE hoạt động
- [ ] Site Settings: INSERT/UPDATE/DELETE hoạt động
- [ ] Products: Policies hoạt động đúng
- [ ] Orders: Policies hoạt động đúng

### Data Integrity
- [ ] Stock quantity = sum(inventory_lots.quantity)
- [ ] Order total = sum(order_items.total)
- [ ] Accounts payable remaining = original - paid

---

## 🧪 FUNCTIONAL TEST (2-3 giờ)

### Products
- [ ] CRUD sản phẩm
- [ ] Upload hình ảnh
- [ ] Upload video
- [ ] Gallery images
- [ ] Categories
- [ ] Search & Filter

### Orders
- [ ] Tạo đơn hàng (guest)
- [ ] Tạo đơn hàng (authenticated)
- [ ] Cập nhật trạng thái đơn
- [ ] Confirm đơn → Tạo stock out
- [ ] Cancel đơn → Trả hàng về kho

### Inventory
- [ ] Tạo phiếu nhập kho
- [ ] Tạo phiếu xuất kho
- [ ] FIFO logic
- [ ] Tính giá vốn trung bình
- [ ] Cảnh báo tồn kho thấp

### Accounting
- [ ] Accounts Payable
- [ ] Accounts Receivable
- [ ] Ghi nhận thanh toán
- [ ] Reports

### Coupons
- [ ] Tạo coupon (đã fix)
- [ ] Cập nhật coupon
- [ ] Xóa coupon
- [ ] Áp dụng coupon khi checkout
- [ ] Validation: mã trùng, hết hạn, hết lượt

### Flash Sales
- [ ] Tạo flash sale
- [ ] Thêm sản phẩm vào flash sale
- [ ] Countdown timer
- [ ] Giá flash sale hiển thị đúng

---

## 🔒 SECURITY TEST (1 giờ)

### RLS Policies
- [ ] Products: User chỉ thấy active products
- [ ] Products: User không thể INSERT/UPDATE/DELETE
- [ ] Orders: User chỉ thấy đơn của mình
- [ ] Orders: Guest có thể tra cứu bằng code + phone
- [ ] Coupons: User chỉ thấy active coupons
- [ ] Coupons: Admin có thể CRUD (đã fix)
- [ ] Storage: Chỉ admin upload được

### Authentication
- [ ] Session timeout
- [ ] Token refresh
- [ ] Invalid credentials
- [ ] OAuth flow

### Authorization
- [ ] Super admin: Tất cả quyền
- [ ] Manager: Quyền theo config
- [ ] Staff: Quyền hạn chế
- [ ] Protected routes

---

## 🐛 EDGE CASES (1 giờ)

### Boundary Values
- [ ] Số lượng = 0 → Validation error
- [ ] Số lượng < 0 → Validation error
- [ ] Giá = 0 → Validation error
- [ ] Giá < 0 → Validation error
- [ ] Số lượng xuất > tồn kho → Error

### Error Handling
- [ ] Network error → Error message
- [ ] Server error (500) → Error message
- [ ] Validation error → Hiển thị lỗi
- [ ] Foreign key constraint → Error message

### Data Edge Cases
- [ ] Không có sản phẩm → Empty state
- [ ] Không có đơn hàng → Empty state
- [ ] Slug trùng → Auto generate unique
- [ ] Email trùng → Error message

---

## 📱 UI/UX TEST (30 phút)

### Responsive
- [ ] Mobile (375px)
- [ ] Tablet (768px)
- [ ] Desktop (1920px)

### Accessibility
- [ ] Keyboard navigation
- [ ] Alt text cho images
- [ ] ARIA labels

### User Experience
- [ ] Loading states
- [ ] Error messages rõ ràng
- [ ] Success messages
- [ ] Form validation

---

## ⚡ PERFORMANCE TEST (30 phút)

### Page Load
- [ ] Trang chủ < 2s
- [ ] Danh sách sản phẩm < 2s
- [ ] Chi tiết sản phẩm < 1s

### Database
- [ ] Queries sử dụng index
- [ ] Không có N+1 queries
- [ ] Pagination hoạt động

---

## 📊 INTEGRATION TEST (1 giờ)

### Database Functions
- [ ] `can_access_admin()` hoạt động
- [ ] `get_product_stock()` hoạt động
- [ ] `stock_out_fifo()` hoạt động
- [ ] `calculate_order_profit()` hoạt động

### Supabase Integration
- [ ] Auth hoạt động
- [ ] Database queries hoạt động
- [ ] Storage upload hoạt động
- [ ] RPC calls hoạt động

---

## ✅ FINAL CHECKLIST

### Before Release
- [ ] Tất cả P0 test cases pass
- [ ] Không có Critical bugs
- [ ] RLS policies hoạt động đúng
- [ ] Data integrity đảm bảo
- [ ] Performance đạt yêu cầu
- [ ] Security không có lỗ hổng

### Documentation
- [ ] Test results documented
- [ ] Bugs logged và tracked
- [ ] Known issues documented

---

## 🐛 BUG TRACKING

### Critical Bugs (P0)
- [ ] List critical bugs here

### High Priority Bugs (P1)
- [ ] List high priority bugs here

### Medium/Low Bugs (P2-P3)
- [ ] List other bugs here

---

**Lưu ý:** 
- Đánh dấu ✅ khi pass
- Đánh dấu ❌ khi fail và ghi chú bug
- Đánh dấu ⚠️ khi cần review lại
