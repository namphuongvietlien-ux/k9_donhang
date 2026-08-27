Hãy sửa lại module Phân xuất nội bộ (cụ thể là phần hiển thị và in "Phiếu tổng hợp đơn tuần" trong InternalDispatchWorkspace.tsx hoặc file xử lý in tương ứng):

1. **Tách và hiển thị chi tiết theo từng chi nhánh trên bảng tổng hợp:**

   - Hiện tại bảng tổng hợp đơn tuần đang gom chung chung (chỉ có cột "Tổng SL"). Cần bổ sung các cột chi nhánh nhận (giống như giao diện PackingSummaryBoard) để phân tách rõ mã nào thuộc chi nhánh nào, số lượng chi nhánh đó nhận là bao nhiêu.

   - Tránh tình trạng gom toàn bộ gộp chung gây khó khăn cho việc phân loại xuất hàng thực tế.

2. **Lọc và In theo từng chi nhánh độc lập:**

   - Bổ sung tùy chọn hoặc tab lọc theo chi nhánh trên màn hình phân xuất đơn tuần.

   - Khi bấm in phiếu tổng hợp đơn tuần, nếu người dùng chọn chi nhánh cụ thể thì bản in phải chỉ xuất ra danh sách mã và số lượng phân bổ của riêng chi nhánh đó, số thứ tự (STT) chạy liên tục từ 1, 2, 3... không bị nhảy cóc.

   - Nếu ở chế độ in toàn hệ thống thì hiển thị đầy đủ các cột chi nhánh rõ ràng.

Vui lòng kiểm tra file `InternalDispatchWorkspace.tsx` và các file helper in ấn liên quan đến phân xuất nội bộ để xử lý dứt điểm vấn đề này.