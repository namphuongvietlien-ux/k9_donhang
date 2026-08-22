# Project Context: Hệ thống Quản lý Kho & Đặt hàng (Viet Lien Co., Ltd)

## Tech Stack
- **Frontend & API:** Next.js / Vite, React, TypeScript, Tailwind CSS, Shadcn UI.
- **Backend & Database:** Supabase (PostgreSQL, Row Level Security - RLS, Stored Procedures - RPC).
- **Deployment:** Vercel.
- **Tools:** SheetJS (`xlsx`) cho tính năng xuất Excel.

## Core Business Rules (Quy tắc nghiệp vụ cốt lõi)
1. **Cố định Số thứ tự (STT) dòng hàng:** 
   - Khi thêm sản phẩm vào đơn hàng, gán `stt` tăng dần theo thời gian tạo. 
   - Khóa cứng STT, **không** tự động sắp xếp lại theo tên/mã hàng khi sửa số lượng (`qty`) hay ghi chú để nhân viên in phiếu đi soạn hàng không bị xáo trộn.
   - Luôn query hoặc hiển thị theo `ORDER BY stt ASC`.
2. **Quy đổi đơn vị tính từ danh mục (CSV):**
   - Các dòng có chung Mã SKU. Dòng có giá trị tại cột "Tỷ lệ quy đổi" là Đơn vị lớn (Thùng, Bao...). Dòng trống là Đơn vị cơ sở nhỏ nhất (Cái, Lẻ...).
   - Giao diện Order phải có tính năng hiển thị quy đổi thời gian thực (*Live Unit Breakdown*).
3. **Luồng xuất kho nội bộ & Đơn tuần:**
   - Chi nhánh gửi đơn $\rightarrow$ Thông báo Telegram tới Group nội bộ (`TELEGRAM_INTERNAL_CHAT_ID`) $\rightarrow$ Quản lý duyệt $\rightarrow$ Tự động gom vào Đơn tuần $\rightarrow$ Quản lý in đơn duyệt $\rightarrow$ Admin Tổng công ty xác nhận hoàn tất (`processed`).

## Coding Guidelines
- Luôn viết code TypeScript chặt chẽ, kiểm tra null/undefined cho dữ liệu trả về từ Supabase.
- Không thay đổi cấu trúc bảng cốt lõi liên quan đến `stt` và `don_hang_id` mà không có migration kèm theo khóa ngoại (foreign key) tương ứng.