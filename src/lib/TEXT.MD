[TASK: FIX BARCODE MULTI-UNIT CONFLICT & NAME RESOLUTION]
Hãy kiểm tra logic lập bảng tra cứu mã vạch và bóc tách đơn vị tính trong file `src/lib/catalogUnitBarcode.ts` (và các logic tra cứu/quét mã vạch trong form tạo đơn):

1. Vấn đề thực tế: 
   - Một mã hàng (SKU) có 2 mã vạch: `barcode` (cho ĐVT cơ sở) và `barcode_2` (cho ĐVT quy đổi lớn).
   - Khi tra cứu, quét mã vạch hoặc chuyển đổi đơn vị, hệ thống đang bị nhầm lẫn tên hàng hóa hoặc bị ghi đè (overwrite) dữ liệu do xung đột khóa giữa hai mã vạch này.

2. Yêu cầu xử lý:
   - Đảm bảo khi xây dựng từ điển / bảng tra cứu (lookup map) theo mã vạch, mỗi mã vạch (`barcode` hoặc `barcode_2`) phải là một **khóa độc lập**, trỏ chính xác về đúng đơn vị (Unit), tên hàng, mã SKU và đơn giá tương ứng của nó.
   - Tránh tình trạng mã vạch của ĐVT lớn bị gán nhầm hoặc lấy nhầm tên/thông tin của ĐVT cơ sở (và ngược lại).

3. Ràng buộc:
   - Chỉ tập trung kiểm tra và sửa trong phạm vi các file xử lý danh mục sản phẩm, đơn vị tính (`catalogUnitBarcode.ts`) và các hàm tìm kiếm mã vạch. Không quét toàn bộ repo để tiết kiệm token.