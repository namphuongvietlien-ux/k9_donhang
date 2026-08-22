[TASK: CHECK STOCK AVAILABILITY & HIDDEN LOGIC]
Hãy kiểm tra logic xác định sản phẩm hết hàng/bị ẩn trong code hiển thị danh sách sản phẩm:
1. Xem xét cách hệ thống tra cứu tồn kho từ bảng `stock_on_hand` có đang khớp đúng với khóa đơn vị `CODE|DV:<normalized-unit>` thông qua `normalizeUnitKey` không.
2. Kiểm tra xem có điều kiện nào đang nhầm lẫn giữa tồn kho cơ sở và tồn kho theo đơn vị lớn (Thùng/Bao) khiến sản phẩm còn nhiều mà vẫn bị báo ẩn.
Chỉ kiểm tra trong phạm vi các file xử lý kho và stock, không quét toàn bộ repo.2