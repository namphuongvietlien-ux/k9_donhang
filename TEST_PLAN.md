# KẾ HOẠCH TEST HỆ THỐNG - TĂM NHỰA VINON

**Ngày tạo:** 2025-01-XX  
**Phiên bản:** 1.0  
**Người phụ trách:** QC Team  
**Mục tiêu:** Đảm bảo hệ thống hoạt động ổn định, không có lỗi logic, và đáp ứng yêu cầu nghiệp vụ

---

## 📋 TỔNG QUAN HỆ THỐNG

**Hệ thống:** E-commerce Website - Tăm Nhựa Vinon  
**Tech Stack:**
- Frontend: React + TypeScript + Vite
- Backend: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- Database: PostgreSQL với RLS (Row Level Security)
- Authentication: Supabase Auth (Email/Password, Google OAuth)

**Phạm vi test:**
- 40+ Admin pages
- 15+ Public pages
- 30+ Database tables
- 100+ RLS policies
- Inventory & Accounting system
- E-commerce integration (Shopee, TikTok, GHN, J&T)

---

## 🎯 MỤC TIÊU TEST

1. **Functional Testing:** Kiểm tra tất cả chức năng hoạt động đúng
2. **Security Testing:** Kiểm tra RLS policies, authentication, authorization
3. **Integration Testing:** Kiểm tra tích hợp giữa các module
4. **Data Integrity:** Kiểm tra tính toàn vẹn dữ liệu
5. **Edge Cases:** Kiểm tra các trường hợp biên
6. **Performance:** Kiểm tra hiệu suất và tối ưu
7. **UI/UX:** Kiểm tra giao diện và trải nghiệm người dùng

---

## 📊 MA TRẬN ƯU TIÊN TEST

| Module | Mức độ quan trọng | Mức độ rủi ro | Ưu tiên |
|--------|-------------------|---------------|---------|
| Authentication & Authorization | Cao | Cao | P0 |
| Đặt hàng & Thanh toán | Cao | Cao | P0 |
| Quản lý kho (Inventory) | Cao | Cao | P0 |
| Quản lý đơn hàng | Cao | Trung bình | P1 |
| Quản lý sản phẩm | Cao | Trung bình | P1 |
| Công nợ (Accounting) | Trung bình | Cao | P1 |
| Flash Sales | Trung bình | Trung bình | P2 |
| Coupons | Trung bình | Trung bình | P2 |
| Blog/News | Thấp | Thấp | P3 |

---

## 🧪 PHẦN 1: TEST CHỨC NĂNG NGƯỜI DÙNG (USER-FACING)

### 1.1. Authentication & User Management

#### Test Case 1.1.1: Đăng ký tài khoản
**Mục tiêu:** Kiểm tra user có thể đăng ký tài khoản mới

**Test Steps:**
1. Truy cập `/auth`
2. Click "Đăng ký"
3. Điền form:
   - Email hợp lệ
   - Password (tối thiểu 6 ký tự)
   - Họ tên
4. Submit form

**Expected Results:**
- ✅ Tạo tài khoản thành công
- ✅ Tự động tạo profile trong database
- ✅ Redirect về trang chủ hoặc profile
- ✅ Nhận email xác nhận (nếu có)

**Edge Cases:**
- ❌ Email đã tồn tại → Hiển thị lỗi
- ❌ Password quá ngắn → Validation error
- ❌ Email không hợp lệ → Validation error
- ❌ Form trống → Validation error

#### Test Case 1.1.2: Đăng nhập Email/Password
**Mục tiêu:** Kiểm tra user có thể đăng nhập bằng email/password

**Test Steps:**
1. Truy cập `/auth`
2. Click "Đăng nhập"
3. Nhập email và password hợp lệ
4. Submit

**Expected Results:**
- ✅ Đăng nhập thành công
- ✅ Session được tạo
- ✅ Redirect về trang chủ hoặc trang trước đó
- ✅ User role và permissions được load

**Edge Cases:**
- ❌ Sai email → Lỗi "Email hoặc mật khẩu không đúng"
- ❌ Sai password → Lỗi "Email hoặc mật khẩu không đúng"
- ❌ Tài khoản chưa xác nhận email → Thông báo cần xác nhận
- ❌ Tài khoản bị khóa → Thông báo tài khoản bị khóa

#### Test Case 1.1.3: Đăng nhập Google OAuth
**Mục tiêu:** Kiểm tra OAuth flow hoạt động đúng

**Test Steps:**
1. Truy cập `/auth`
2. Click "Đăng nhập với Google"
3. Chọn tài khoản Google
4. Authorize

**Expected Results:**
- ✅ Redirect về `/admin/login/callback`
- ✅ Tạo session
- ✅ Tạo profile nếu chưa có
- ✅ Link với user_id từ Google

**Edge Cases:**
- ❌ User hủy OAuth → Quay về trang login
- ❌ Email Google đã được dùng bởi tài khoản khác → Xử lý conflict

#### Test Case 1.1.4: Đăng xuất
**Mục tiêu:** Kiểm tra user có thể đăng xuất

**Test Steps:**
1. Đăng nhập thành công
2. Click "Đăng xuất"

**Expected Results:**
- ✅ Session bị xóa
- ✅ Redirect về trang chủ
- ✅ Cart được clear (nếu cần)
- ✅ Không thể truy cập protected routes

#### Test Case 1.1.5: Quên mật khẩu
**Mục tiêu:** Kiểm tra reset password flow

**Test Steps:**
1. Truy cập `/auth`
2. Click "Quên mật khẩu"
3. Nhập email
4. Submit

**Expected Results:**
- ✅ Gửi email reset password
- ✅ Link reset có token hợp lệ
- ✅ Có thể đặt lại mật khẩu mới

### 1.2. Trang chủ & Navigation

#### Test Case 1.2.1: Trang chủ load đúng
**Mục tiêu:** Kiểm tra trang chủ hiển thị đầy đủ

**Test Steps:**
1. Truy cập `/`
2. Scroll xuống các section

**Expected Results:**
- ✅ Hero banner hiển thị
- ✅ Flash sales section (nếu có)
- ✅ Sản phẩm nổi bật
- ✅ Journey section
- ✅ Core values
- ✅ Story section
- ✅ Footer

**Edge Cases:**
- ❌ Không có flash sales → Section không hiển thị hoặc hiển thị empty state
- ❌ Không có sản phẩm → Hiển thị "Chưa có sản phẩm"

#### Test Case 1.2.2: Navigation menu
**Mục tiêu:** Kiểm tra menu điều hướng

**Test Steps:**
1. Click từng menu item
2. Kiểm tra URL và nội dung

**Expected Results:**
- ✅ Tất cả links hoạt động
- ✅ Active state hiển thị đúng
- ✅ Mobile menu hoạt động (responsive)

### 1.3. Sản phẩm

#### Test Case 1.3.1: Danh sách sản phẩm
**Mục tiêu:** Kiểm tra trang danh sách sản phẩm

**Test Steps:**
1. Truy cập `/products`
2. Test filter, sort, pagination
3. Click vào sản phẩm

**Expected Results:**
- ✅ Hiển thị danh sách sản phẩm
- ✅ Filter theo category hoạt động
- ✅ Sort hoạt động
- ✅ Pagination hoạt động
- ✅ Chỉ hiển thị sản phẩm `is_active = true`

**Edge Cases:**
- ❌ Không có sản phẩm → Empty state
- ❌ Filter không có kết quả → Thông báo
- ❌ Sản phẩm không active → Không hiển thị

#### Test Case 1.3.2: Chi tiết sản phẩm
**Mục tiêu:** Kiểm tra trang chi tiết sản phẩm

**Test Steps:**
1. Truy cập `/product/:slug`
2. Kiểm tra các elements

**Expected Results:**
- ✅ Hiển thị đầy đủ thông tin sản phẩm
- ✅ Gallery images hoạt động
- ✅ Video player hoạt động (nếu có)
- ✅ Mô tả sản phẩm
- ✅ Giá và giá gốc
- ✅ Stock quantity
- ✅ Button "Thêm vào giỏ"
- ✅ Đánh giá sản phẩm
- ✅ FAQ (nếu có)

**Edge Cases:**
- ❌ Sản phẩm không tồn tại → 404
- ❌ Sản phẩm không active → 404 hoặc redirect
- ❌ Hết hàng → Disable button "Thêm vào giỏ"
- ❌ Slug không hợp lệ → 404

#### Test Case 1.3.3: Flash Sales
**Mục tiêu:** Kiểm tra flash sales hoạt động

**Test Steps:**
1. Truy cập trang có flash sales
2. Kiểm tra countdown timer
3. Thêm sản phẩm flash sale vào giỏ

**Expected Results:**
- ✅ Hiển thị flash sales đang active
- ✅ Countdown timer chạy đúng
- ✅ Giá flash sale hiển thị
- ✅ Có thể thêm vào giỏ với giá flash sale

**Edge Cases:**
- ❌ Flash sale đã hết hạn → Không hiển thị
- ❌ Flash sale chưa bắt đầu → Không hiển thị
- ❌ Hết số lượng → Disable button
- ❌ Timer hết → Tự động ẩn hoặc disable

### 1.4. Giỏ hàng & Checkout

#### Test Case 1.4.1: Thêm sản phẩm vào giỏ
**Mục tiêu:** Kiểm tra thêm sản phẩm vào giỏ hàng

**Test Steps:**
1. Vào trang sản phẩm
2. Click "Thêm vào giỏ"
3. Kiểm tra cart drawer

**Expected Results:**
- ✅ Sản phẩm được thêm vào giỏ
- ✅ Cart drawer mở ra
- ✅ Số lượng trong cart icon tăng
- ✅ Tổng tiền được tính đúng
- ✅ Lưu vào localStorage

**Edge Cases:**
- ❌ Thêm sản phẩm đã có trong giỏ → Tăng số lượng
- ❌ Số lượng vượt quá stock → Hiển thị lỗi
- ❌ Hết hàng → Disable button

#### Test Case 1.4.2: Cập nhật giỏ hàng
**Mục tiêu:** Kiểm tra cập nhật số lượng trong giỏ

**Test Steps:**
1. Mở cart drawer
2. Tăng/giảm số lượng
3. Xóa sản phẩm

**Expected Results:**
- ✅ Số lượng cập nhật đúng
- ✅ Tổng tiền tính lại
- ✅ Xóa sản phẩm thành công
- ✅ localStorage được cập nhật

#### Test Case 1.4.3: Tính phí vận chuyển
**Mục tiêu:** Kiểm tra tính phí vận chuyển theo địa chỉ

**Test Steps:**
1. Vào checkout
2. Chọn tỉnh/thành, quận/huyện, phường/xã
3. Kiểm tra phí vận chuyển

**Expected Results:**
- ✅ Phí vận chuyển được tính đúng
- ✅ Tổng tiền bao gồm phí vận chuyển
- ✅ Hiển thị thông báo nếu không có phí

**Edge Cases:**
- ❌ Địa chỉ không có trong hệ thống → Thông báo
- ❌ Không có bảng giá cho địa chỉ → Sử dụng giá mặc định

#### Test Case 1.4.4: Áp dụng mã giảm giá
**Mục tiêu:** Kiểm tra áp dụng coupon

**Test Steps:**
1. Vào checkout
2. Nhập mã giảm giá
3. Click "Áp dụng"

**Expected Results:**
- ✅ Mã hợp lệ → Áp dụng giảm giá
- ✅ Tổng tiền được tính lại
- ✅ Hiển thị số tiền giảm

**Edge Cases:**
- ❌ Mã không tồn tại → Lỗi "Mã không hợp lệ"
- ❌ Mã đã hết hạn → Lỗi "Mã đã hết hạn"
- ❌ Mã đã hết lượt sử dụng → Lỗi "Mã đã hết lượt"
- ❌ Đơn hàng không đạt giá trị tối thiểu → Lỗi
- ❌ Mã không active → Lỗi

#### Test Case 1.4.5: Đặt hàng (Guest)
**Mục tiêu:** Kiểm tra đặt hàng không cần đăng nhập

**Test Steps:**
1. Vào checkout
2. Điền form:
   - Tên khách hàng
   - Số điện thoại
   - Địa chỉ
3. Submit

**Expected Results:**
- ✅ Tạo đơn hàng thành công
- ✅ `user_id = NULL`
- ✅ Tạo `order_code` tự động
- ✅ Tạo order items
- ✅ Redirect về trang xác nhận
- ✅ Hiển thị mã đơn hàng

**Edge Cases:**
- ❌ Form validation → Hiển thị lỗi
- ❌ Sản phẩm hết hàng trong lúc checkout → Thông báo
- ❌ Giá sản phẩm thay đổi → Xử lý conflict

#### Test Case 1.4.6: Đặt hàng (Authenticated)
**Mục tiêu:** Kiểm tra đặt hàng khi đã đăng nhập

**Test Steps:**
1. Đăng nhập
2. Vào checkout
3. Form tự động điền từ profile
4. Submit

**Expected Results:**
- ✅ Tạo đơn hàng với `user_id`
- ✅ Link với profile
- ✅ Có thể xem trong lịch sử đơn hàng

### 1.5. Tra cứu đơn hàng

#### Test Case 1.5.1: Tra cứu bằng mã đơn và số điện thoại
**Mục tiêu:** Kiểm tra tra cứu đơn hàng guest

**Test Steps:**
1. Truy cập `/order-lookup`
2. Nhập mã đơn hàng và số điện thoại
3. Submit

**Expected Results:**
- ✅ Hiển thị thông tin đơn hàng
- ✅ Hiển thị order items
- ✅ Hiển thị trạng thái đơn hàng

**Edge Cases:**
- ❌ Mã đơn không tồn tại → Thông báo
- ❌ Số điện thoại không khớp → Thông báo
- ❌ Đơn hàng của user đã đăng nhập → Redirect về order history

### 1.6. Blog & News

#### Test Case 1.6.1: Danh sách bài viết
**Mục tiêu:** Kiểm tra trang tin tức

**Test Steps:**
1. Truy cập `/news`
2. Kiểm tra danh sách bài viết

**Expected Results:**
- ✅ Hiển thị bài viết đã publish
- ✅ Pagination hoạt động
- ✅ Filter theo category (nếu có)

#### Test Case 1.6.2: Chi tiết bài viết
**Mục tiêu:** Kiểm tra trang chi tiết bài viết

**Test Steps:**
1. Click vào bài viết
2. Kiểm tra nội dung

**Expected Results:**
- ✅ Hiển thị đầy đủ nội dung
- ✅ SEO tags đúng
- ✅ Related posts (nếu có)

---

## 🔧 PHẦN 2: TEST CHỨC NĂNG ADMIN

### 2.1. Authentication & Authorization

#### Test Case 2.1.1: Đăng nhập Admin
**Mục tiêu:** Kiểm tra admin có thể đăng nhập

**Test Steps:**
1. Truy cập `/admin/login`
2. Đăng nhập với tài khoản admin

**Expected Results:**
- ✅ Đăng nhập thành công
- ✅ Redirect về `/admin/dashboard`
- ✅ Load role và permissions
- ✅ Sidebar hiển thị đúng menu theo role

**Edge Cases:**
- ❌ User không có role admin → Redirect về `/admin/forbidden`
- ❌ User không có permission → Ẩn menu items không có quyền

#### Test Case 2.1.2: RBAC System
**Mục tiêu:** Kiểm tra phân quyền theo role

**Test Steps:**
1. Đăng nhập với các role khác nhau:
   - super_admin
   - manager
   - staff
2. Kiểm tra menu và permissions

**Expected Results:**
- ✅ super_admin: Có tất cả quyền
- ✅ manager: Quyền theo cấu hình
- ✅ staff: Quyền hạn chế

#### Test Case 2.1.3: Protected Routes
**Mục tiêu:** Kiểm tra routes được bảo vệ

**Test Steps:**
1. Không đăng nhập → Truy cập `/admin/products`
2. Đăng nhập user thường → Truy cập `/admin/products`
3. Đăng nhập admin → Truy cập `/admin/products`

**Expected Results:**
- ✅ Case 1: Redirect về `/admin/login`
- ✅ Case 2: Redirect về `/admin/forbidden`
- ✅ Case 3: Truy cập được

### 2.2. Quản lý Sản phẩm

#### Test Case 2.2.1: Tạo sản phẩm mới
**Mục tiêu:** Kiểm tra tạo sản phẩm

**Test Steps:**
1. Vào `/admin/products`
2. Click "Thêm sản phẩm"
3. Điền form đầy đủ
4. Upload hình ảnh
5. Submit

**Expected Results:**
- ✅ Tạo sản phẩm thành công
- ✅ Hình ảnh upload lên Supabase Storage
- ✅ Slug tự động generate
- ✅ Redirect về danh sách

**Edge Cases:**
- ❌ Slug trùng → Tự động thêm số
- ❌ Hình ảnh quá lớn → Validation error
- ❌ Form validation → Hiển thị lỗi

#### Test Case 2.2.2: Cập nhật sản phẩm
**Mục tiêu:** Kiểm tra cập nhật sản phẩm

**Test Steps:**
1. Vào chi tiết sản phẩm
2. Sửa thông tin
3. Submit

**Expected Results:**
- ✅ Cập nhật thành công
- ✅ `updated_at` được cập nhật
- ✅ Thay đổi hình ảnh → Upload mới, xóa cũ

#### Test Case 2.2.3: Xóa sản phẩm
**Mục tiêu:** Kiểm tra xóa sản phẩm

**Test Steps:**
1. Vào danh sách sản phẩm
2. Click xóa
3. Confirm

**Expected Results:**
- ✅ Xóa thành công
- ✅ Có thể soft delete (is_active = false) hoặc hard delete
- ✅ Kiểm tra foreign key constraints

**Edge Cases:**
- ❌ Sản phẩm có đơn hàng → Không cho xóa hoặc cascade

#### Test Case 2.2.4: Upload hình ảnh
**Mục tiêu:** Kiểm tra upload hình ảnh

**Test Steps:**
1. Upload hình ảnh
2. Kiểm tra trong Supabase Storage

**Expected Results:**
- ✅ Upload thành công
- ✅ Public URL được tạo
- ✅ RLS policy cho phép admin upload
- ✅ Hình ảnh hiển thị đúng

**Edge Cases:**
- ❌ File không phải image → Validation error
- ❌ File quá lớn → Validation error
- ❌ Upload lỗi → Hiển thị error message

### 2.3. Quản lý Đơn hàng

#### Test Case 2.3.1: Xem danh sách đơn hàng
**Mục tiêu:** Kiểm tra danh sách đơn hàng

**Test Steps:**
1. Vào `/admin/orders`
2. Kiểm tra filter, sort, pagination

**Expected Results:**
- ✅ Hiển thị tất cả đơn hàng
- ✅ Filter theo trạng thái hoạt động
- ✅ Sort hoạt động
- ✅ Pagination hoạt động

#### Test Case 2.3.2: Cập nhật trạng thái đơn hàng
**Mục tiêu:** Kiểm tra cập nhật trạng thái

**Test Steps:**
1. Vào chi tiết đơn hàng
2. Thay đổi trạng thái:
   - pending → confirmed
   - confirmed → shipped
   - shipped → delivered
   - confirmed → cancelled

**Expected Results:**
- ✅ Cập nhật trạng thái thành công
- ✅ confirmed → Tự động tạo stock_out và accounts_receivable
- ✅ cancelled → Trả hàng về kho
- ✅ delivered → Cập nhật accounts_receivable

**Edge Cases:**
- ❌ Trạng thái không hợp lệ → Validation error
- ❌ Hết hàng khi confirm → Thông báo lỗi

#### Test Case 2.3.3: Xem chi tiết đơn hàng
**Mục tiêu:** Kiểm tra chi tiết đơn hàng

**Test Steps:**
1. Click vào đơn hàng
2. Kiểm tra thông tin

**Expected Results:**
- ✅ Hiển thị đầy đủ thông tin
- ✅ Hiển thị order items
- ✅ Hiển thị thông tin khách hàng
- ✅ Hiển thị lịch sử thay đổi trạng thái

### 2.4. Quản lý Kho (Inventory)

#### Test Case 2.4.1: Tạo phiếu nhập kho
**Mục tiêu:** Kiểm tra nhập kho

**Test Steps:**
1. Vào `/admin/stock-in`
2. Tạo phiếu nhập mới
3. Thêm sản phẩm và số lượng
4. Submit

**Expected Results:**
- ✅ Tạo phiếu nhập thành công
- ✅ Tạo `stock_in_transactions` record
- ✅ Tạo `stock_in_items` records
- ✅ Tạo `inventory_lots` (FIFO)
- ✅ Cập nhật `products.stock_quantity`
- ✅ Tính `average_cost` mới
- ✅ Tạo `accounts_payable` (nếu chưa thanh toán)

**Edge Cases:**
- ❌ Số lượng <= 0 → Validation error
- ❌ Giá <= 0 → Validation error
- ❌ Supplier không tồn tại → Foreign key error

#### Test Case 2.4.2: Tạo phiếu xuất kho
**Mục tiêu:** Kiểm tra xuất kho

**Test Steps:**
1. Vào `/admin/stock-out`
2. Tạo phiếu xuất
3. Chọn sản phẩm và số lượng
4. Submit

**Expected Results:**
- ✅ Tạo phiếu xuất thành công
- ✅ Xuất theo FIFO (lô cũ nhất trước)
- ✅ Cập nhật `inventory_lots.quantity`
- ✅ Giảm `products.stock_quantity`
- ✅ Tính giá vốn đúng

**Edge Cases:**
- ❌ Số lượng xuất > tồn kho → Validation error
- ❌ Không có lô nào → Thông báo lỗi

#### Test Case 2.4.3: Xem tồn kho
**Mục tiêu:** Kiểm tra xem tồn kho

**Test Steps:**
1. Vào `/admin/inventory`
2. Kiểm tra danh sách tồn kho

**Expected Results:**
- ✅ Hiển thị tồn kho theo lô
- ✅ Hiển thị giá vốn trung bình
- ✅ Cảnh báo tồn kho thấp
- ✅ Cảnh báo hạn sử dụng

#### Test Case 2.4.4: FIFO Logic
**Mục tiêu:** Kiểm tra logic FIFO

**Test Steps:**
1. Nhập kho nhiều lô với giá khác nhau
2. Xuất kho
3. Kiểm tra lô nào được xuất trước

**Expected Results:**
- ✅ Lô cũ nhất được xuất trước
- ✅ Giá vốn tính đúng theo lô
- ✅ `inventory_lots` được cập nhật đúng

### 2.5. Quản lý Công nợ (Accounting)

#### Test Case 2.5.1: Accounts Payable
**Mục tiêu:** Kiểm tra công nợ phải trả

**Test Steps:**
1. Vào `/admin/accounts-payable`
2. Xem danh sách công nợ
3. Ghi nhận thanh toán

**Expected Results:**
- ✅ Hiển thị danh sách công nợ
- ✅ Tính toán `remaining_amount` đúng
- ✅ Ghi nhận thanh toán thành công
- ✅ Cập nhật status (pending → partial → paid)

#### Test Case 2.5.2: Accounts Receivable
**Mục tiêu:** Kiểm tra công nợ phải thu

**Test Steps:**
1. Vào `/admin/accounts-receivable`
2. Xem danh sách công nợ
3. Ghi nhận thanh toán

**Expected Results:**
- ✅ Hiển thị công nợ từ đơn hàng
- ✅ Tự động tạo khi confirm đơn hàng
- ✅ Ghi nhận thanh toán thành công

### 2.6. Quản lý Coupons

#### Test Case 2.6.1: Tạo coupon
**Mục tiêu:** Kiểm tra tạo coupon (ĐÃ FIX)

**Test Steps:**
1. Vào `/admin/coupons`
2. Click "Thêm mã giảm giá"
3. Điền form
4. Submit

**Expected Results:**
- ✅ Tạo coupon thành công
- ✅ RLS policy cho phép INSERT
- ✅ Validation hoạt động

**Edge Cases:**
- ❌ Mã trùng → Lỗi unique constraint
- ❌ Giá trị giảm giá > 100% (percentage) → Validation error

#### Test Case 2.6.2: Cập nhật coupon
**Mục tiêu:** Kiểm tra cập nhật coupon

**Test Steps:**
1. Vào chi tiết coupon
2. Sửa thông tin
3. Submit

**Expected Results:**
- ✅ Cập nhật thành công
- ✅ RLS policy cho phép UPDATE

#### Test Case 2.6.3: Xóa coupon
**Mục tiêu:** Kiểm tra xóa coupon

**Test Steps:**
1. Click xóa coupon
2. Confirm

**Expected Results:**
- ✅ Xóa thành công
- ✅ RLS policy cho phép DELETE

### 2.7. Flash Sales

#### Test Case 2.7.1: Tạo flash sale
**Mục tiêu:** Kiểm tra tạo flash sale

**Test Steps:**
1. Vào `/admin/flash-sales`
2. Tạo flash sale mới
3. Thêm sản phẩm vào flash sale
4. Submit

**Expected Results:**
- ✅ Tạo flash sale thành công
- ✅ RLS policies hoạt động (INSERT/UPDATE/DELETE)
- ✅ Sản phẩm hiển thị với giá flash sale

### 2.8. Quản lý Users

#### Test Case 2.8.1: Xem danh sách users
**Mục tiêu:** Kiểm tra danh sách users

**Test Steps:**
1. Vào `/admin/users`
2. Kiểm tra danh sách

**Expected Results:**
- ✅ Hiển thị danh sách users
- ✅ Hiển thị role của mỗi user
- ✅ Filter và search hoạt động

#### Test Case 2.8.2: Phân quyền user
**Mục tiêu:** Kiểm tra gán role cho user

**Test Steps:**
1. Vào chi tiết user
2. Gán role mới
3. Submit

**Expected Results:**
- ✅ Cập nhật role thành công
- ✅ Permissions được cập nhật
- ✅ User có thể truy cập theo role mới

---

## 🔒 PHẦN 3: TEST SECURITY & RLS POLICIES

### 3.1. Row Level Security (RLS) Testing

#### Test Case 3.1.1: Test RLS cho Products
**Mục tiêu:** Kiểm tra RLS policies cho bảng products

**Test Steps:**
1. Đăng nhập user thường
2. Thử SELECT, INSERT, UPDATE, DELETE trên products

**Expected Results:**
- ✅ SELECT: Chỉ thấy products `is_active = true`
- ❌ INSERT: 403 Forbidden (không có quyền)
- ❌ UPDATE: 403 Forbidden
- ❌ DELETE: 403 Forbidden

**Admin:**
- ✅ SELECT: Thấy tất cả products
- ✅ INSERT: Thành công
- ✅ UPDATE: Thành công
- ✅ DELETE: Thành công

#### Test Case 3.1.2: Test RLS cho Coupons
**Mục tiêu:** Kiểm tra RLS policies cho coupons (ĐÃ FIX)

**Test Steps:**
1. Đăng nhập admin
2. Thử INSERT, UPDATE, DELETE coupons

**Expected Results:**
- ✅ INSERT: Thành công (đã fix)
- ✅ UPDATE: Thành công (đã fix)
- ✅ DELETE: Thành công (đã fix)

**User thường:**
- ✅ SELECT: Chỉ thấy coupons `is_active = true`
- ❌ INSERT/UPDATE/DELETE: 403 Forbidden

#### Test Case 3.1.3: Test RLS cho Orders
**Mục tiêu:** Kiểm tra RLS policies cho orders

**Test Steps:**
1. User A tạo đơn hàng
2. User B (không đăng nhập) thử tra cứu đơn của User A
3. User B (đã đăng nhập) thử xem đơn của User A

**Expected Results:**
- ✅ Guest có thể tra cứu đơn bằng order_code + phone
- ❌ User B không thể xem đơn của User A (trừ admin)
- ✅ User A có thể xem đơn của mình
- ✅ Admin có thể xem tất cả đơn hàng

#### Test Case 3.1.4: Test RLS cho Storage
**Mục tiêu:** Kiểm tra RLS policies cho Supabase Storage

**Test Steps:**
1. User thường thử upload file
2. Admin thử upload file
3. User thường thử xóa file của admin

**Expected Results:**
- ❌ User thường: 403 Forbidden khi upload
- ✅ Admin: Upload thành công
- ❌ User thường: 403 Forbidden khi xóa file của admin

### 3.2. Authentication Security

#### Test Case 3.2.1: Session Management
**Mục tiêu:** Kiểm tra quản lý session

**Test Steps:**
1. Đăng nhập
2. Đợi token hết hạn
3. Thử thực hiện action

**Expected Results:**
- ✅ Token refresh tự động
- ❌ Token hết hạn → Redirect về login

#### Test Case 3.2.2: CSRF Protection
**Mục tiêu:** Kiểm tra bảo vệ CSRF

**Test Steps:**
1. Tạo request từ domain khác
2. Thử thực hiện action

**Expected Results:**
- ❌ Request bị chặn (nếu có CSRF protection)

### 3.3. Authorization Testing

#### Test Case 3.3.1: Role-based Access Control
**Mục tiêu:** Kiểm tra phân quyền theo role

**Test Steps:**
1. Đăng nhập với role `staff`
2. Thử truy cập các trang admin
3. Đăng nhập với role `manager`
4. Thử truy cập các trang admin

**Expected Results:**
- ✅ Menu hiển thị theo permissions
- ❌ Truy cập trang không có quyền → 403 Forbidden

---

## 🔗 PHẦN 4: TEST INTEGRATION

### 4.1. Database Integration

#### Test Case 4.1.1: Foreign Key Constraints
**Mục tiêu:** Kiểm tra foreign keys hoạt động đúng

**Test Steps:**
1. Thử xóa supplier có stock_in_transactions
2. Thử xóa product có order_items
3. Thử xóa order có order_items

**Expected Results:**
- ❌ Xóa supplier → Lỗi foreign key constraint (hoặc cascade)
- ❌ Xóa product → Lỗi foreign key constraint (hoặc cascade)
- ✅ Xóa order → Cascade xóa order_items (nếu có)

#### Test Case 4.1.2: Database Functions
**Mục tiêu:** Kiểm tra các database functions

**Test Steps:**
1. Test `can_access_admin()`
2. Test `get_product_stock()`
3. Test `stock_out_fifo()`
4. Test `calculate_order_profit()`

**Expected Results:**
- ✅ Tất cả functions hoạt động đúng
- ✅ Return đúng kết quả
- ✅ Handle edge cases

### 4.2. API Integration

#### Test Case 4.2.1: Supabase Client
**Mục tiêu:** Kiểm tra kết nối Supabase

**Test Steps:**
1. Test các operations:
   - SELECT
   - INSERT
   - UPDATE
   - DELETE
   - RPC calls

**Expected Results:**
- ✅ Tất cả operations hoạt động
- ✅ Error handling đúng

### 4.3. Storage Integration

#### Test Case 4.3.1: File Upload
**Mục tiêu:** Kiểm tra upload file

**Test Steps:**
1. Upload hình ảnh sản phẩm
2. Upload video sản phẩm
3. Upload banner

**Expected Results:**
- ✅ Upload thành công
- ✅ Public URL được tạo
- ✅ File có thể truy cập public

---

## 📊 PHẦN 5: TEST DATA INTEGRITY

### 5.1. Data Consistency

#### Test Case 5.1.1: Stock Quantity Consistency
**Mục tiêu:** Kiểm tra tính nhất quán của stock

**Test Steps:**
1. Nhập kho sản phẩm
2. Kiểm tra `products.stock_quantity` = sum(`inventory_lots.quantity`)
3. Xuất kho
4. Kiểm tra lại

**Expected Results:**
- ✅ Stock quantity luôn đúng
- ✅ Không có inconsistency

#### Test Case 5.1.2: Order Total Consistency
**Mục tiêu:** Kiểm tra tổng tiền đơn hàng

**Test Steps:**
1. Tạo đơn hàng
2. Kiểm tra `orders.total_amount` = sum(`order_items.price * quantity`)

**Expected Results:**
- ✅ Total amount luôn đúng
- ✅ Bao gồm discount và shipping fee

#### Test Case 5.1.3: Accounts Payable Consistency
**Mục tiêu:** Kiểm tra công nợ phải trả

**Test Steps:**
1. Tạo phiếu nhập chưa thanh toán
2. Kiểm tra `accounts_payable.remaining_amount` = `original_amount - paid_amount`
3. Thanh toán một phần
4. Kiểm tra lại

**Expected Results:**
- ✅ Remaining amount luôn đúng
- ✅ Status được cập nhật đúng

### 5.2. Transaction Integrity

#### Test Case 5.2.1: Order Confirmation Transaction
**Mục tiêu:** Kiểm tra transaction khi confirm đơn

**Test Steps:**
1. Confirm đơn hàng
2. Kiểm tra:
   - Stock out được tạo
   - Accounts receivable được tạo
   - Stock quantity giảm
   - Inventory lots được cập nhật

**Expected Results:**
- ✅ Tất cả operations thành công hoặc rollback
- ✅ Không có partial updates

---

## ⚡ PHẦN 6: TEST PERFORMANCE

### 6.1. Page Load Performance

#### Test Case 6.1.1: Trang chủ Load Time
**Mục tiêu:** Kiểm tra thời gian load trang chủ

**Test Steps:**
1. Clear cache
2. Load trang chủ
3. Đo thời gian

**Expected Results:**
- ✅ First Contentful Paint < 1.5s
- ✅ Time to Interactive < 3s
- ✅ Lazy loading hoạt động

#### Test Case 6.1.2: Product List Load Time
**Mục tiêu:** Kiểm tra thời gian load danh sách sản phẩm

**Test Steps:**
1. Load `/products` với 100+ sản phẩm
2. Đo thời gian

**Expected Results:**
- ✅ Load time < 2s
- ✅ Pagination hoạt động
- ✅ Images lazy load

### 6.2. Database Query Performance

#### Test Case 6.2.1: Query với Index
**Mục tiêu:** Kiểm tra queries sử dụng index

**Test Steps:**
1. Check EXPLAIN ANALYZE cho các queries chính
2. Kiểm tra index usage

**Expected Results:**
- ✅ Queries sử dụng index
- ✅ Không có full table scan
- ✅ Query time < 100ms

---

## 🎨 PHẦN 7: TEST UI/UX

### 7.1. Responsive Design

#### Test Case 7.1.1: Mobile Responsive
**Mục tiêu:** Kiểm tra responsive trên mobile

**Test Steps:**
1. Test trên các kích thước:
   - Mobile (375px, 414px)
   - Tablet (768px, 1024px)
   - Desktop (1280px, 1920px)

**Expected Results:**
- ✅ Layout không bị vỡ
- ✅ Menu mobile hoạt động
- ✅ Touch interactions hoạt động

### 7.2. Accessibility

#### Test Case 7.2.1: Keyboard Navigation
**Mục tiêu:** Kiểm tra điều hướng bằng bàn phím

**Test Steps:**
1. Sử dụng Tab để điều hướng
2. Sử dụng Enter/Space để click

**Expected Results:**
- ✅ Tất cả elements có thể truy cập bằng keyboard
- ✅ Focus indicator rõ ràng

#### Test Case 7.2.2: Screen Reader
**Mục tiêu:** Kiểm tra hỗ trợ screen reader

**Test Steps:**
1. Sử dụng screen reader (NVDA/JAWS)
2. Điều hướng website

**Expected Results:**
- ✅ Alt text cho images
- ✅ ARIA labels đúng
- ✅ Semantic HTML

---

## 🐛 PHẦN 8: TEST EDGE CASES

### 8.1. Boundary Testing

#### Test Case 8.1.1: Số lượng giới hạn
**Mục tiêu:** Kiểm tra các giá trị biên

**Test Steps:**
1. Thêm sản phẩm với số lượng:
   - 0
   - 1
   - Max integer
   - Negative number

**Expected Results:**
- ❌ 0 → Validation error
- ✅ 1 → Thành công
- ❌ Negative → Validation error
- ❌ Max integer → Validation error hoặc handle

#### Test Case 8.1.2: Giá trị tiền tệ
**Mục tiêu:** Kiểm tra giá trị tiền tệ

**Test Steps:**
1. Nhập giá:
   - 0
   - Negative
   - Rất lớn
   - Decimal

**Expected Results:**
- ❌ 0 hoặc negative → Validation error
- ✅ Decimal → Thành công (nếu cho phép)
- ✅ Large number → Thành công (với format đúng)

### 8.2. Error Handling

#### Test Case 8.2.1: Network Errors
**Mục tiêu:** Kiểm tra xử lý lỗi mạng

**Test Steps:**
1. Disconnect network
2. Thử thực hiện action
3. Reconnect
4. Kiểm tra retry

**Expected Results:**
- ✅ Hiển thị error message
- ✅ Retry mechanism hoạt động
- ✅ Không mất dữ liệu

#### Test Case 8.2.2: Server Errors
**Mục tiêu:** Kiểm tra xử lý lỗi server

**Test Steps:**
1. Simulate 500 error
2. Kiểm tra error handling

**Expected Results:**
- ✅ Hiển thị error message thân thiện
- ✅ Log error để debug
- ✅ User có thể retry

---

## 📝 PHẦN 9: CHECKLIST TỔNG HỢP

### 9.1. Critical Paths (P0)

- [ ] User có thể đăng ký/đăng nhập
- [ ] User có thể xem sản phẩm
- [ ] User có thể thêm vào giỏ hàng
- [ ] User có thể đặt hàng
- [ ] Admin có thể đăng nhập
- [ ] Admin có thể quản lý sản phẩm
- [ ] Admin có thể quản lý đơn hàng
- [ ] Admin có thể quản lý kho
- [ ] RLS policies hoạt động đúng
- [ ] Database constraints hoạt động

### 9.2. Important Features (P1)

- [ ] Flash sales hoạt động
- [ ] Coupons hoạt động (đã fix)
- [ ] Tra cứu đơn hàng
- [ ] Quản lý công nợ
- [ ] Reports hoạt động
- [ ] File upload hoạt động

### 9.3. Nice to Have (P2-P3)

- [ ] Blog/News hoạt động
- [ ] AI Chatbot hoạt động
- [ ] Newsletter subscriptions
- [ ] Product reviews

---

## 🔍 PHẦN 10: CÁC VẤN ĐỀ ĐÃ PHÁT HIỆN

### 10.1. Đã Fix

1. **Coupons RLS Policies** (2025-01-08)
   - **Vấn đề:** Thiếu INSERT/UPDATE/DELETE policies
   - **Fix:** Migration `20250108000001_fix_coupons_rls_insert_update_delete.sql`
   - **Status:** ✅ Fixed

### 10.2. Cần Kiểm tra Lại

1. **Flash Sales RLS Policies**
   - Đã có migration fix tương tự
   - Cần verify hoạt động đúng

2. **Site Settings RLS Policies**
   - Đã có migration fix
   - Cần verify

3. **Other Tables từ Merge Migration**
   - Kiểm tra các tables khác có thiếu policies không
   - Tables: products, categories, banners, posts, etc.

---

## 📋 PHẦN 11: TEST EXECUTION PLAN

### Phase 1: Smoke Testing (1 ngày)
- Test các chức năng cơ bản nhất
- Đảm bảo hệ thống có thể sử dụng được

### Phase 2: Functional Testing (3-5 ngày)
- Test tất cả chức năng theo test cases
- Document bugs

### Phase 3: Security Testing (2 ngày)
- Test RLS policies
- Test authentication/authorization
- Test input validation

### Phase 4: Integration Testing (2 ngày)
- Test integration giữa các modules
- Test database functions
- Test API calls

### Phase 5: Regression Testing (1-2 ngày)
- Test lại sau khi fix bugs
- Đảm bảo không có regression

### Phase 6: Performance Testing (1 ngày)
- Test load time
- Test với data lớn
- Optimize nếu cần

---

## 📊 PHẦN 12: BUG REPORT TEMPLATE

```markdown
**Bug ID:** BUG-001
**Title:** [Mô tả ngắn gọn]
**Severity:** Critical/High/Medium/Low
**Priority:** P0/P1/P2/P3
**Module:** [Module bị ảnh hưởng]
**Steps to Reproduce:**
1. ...
2. ...
3. ...

**Expected Result:**
...

**Actual Result:**
...

**Screenshots:**
[Attach screenshots]

**Environment:**
- Browser: [Chrome/Firefox/Safari]
- OS: [Windows/Mac/Linux]
- Version: [App version]

**Additional Notes:**
...
```

---

## ✅ PHẦN 13: ACCEPTANCE CRITERIA

Hệ thống được coi là sẵn sàng khi:

1. ✅ Tất cả P0 test cases pass
2. ✅ 95%+ P1 test cases pass
3. ✅ Không có Critical bugs
4. ✅ Không có High bugs blocking
5. ✅ RLS policies hoạt động đúng
6. ✅ Performance đạt yêu cầu
7. ✅ Security không có lỗ hổng nghiêm trọng

---

## 📚 TÀI LIỆU THAM KHẢO

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [React Testing Best Practices](https://react.dev/learn/testing)
- [PostgreSQL Performance Tuning](https://www.postgresql.org/docs/current/performance-tips.html)

---

**Ngày cập nhật:** 2025-01-XX  
**Version:** 1.0  
**Status:** Draft - Ready for Execution
