Role: Bạn là một Senior Full-stack Developer chuyên gia gỡ lỗi (Debugging Expert) hệ thống React, TypeScript, Supabase.

Context & Problem:

Hệ thống hiện tại đang gặp lỗi nghiêm trọng trong việc tra cứu và tìm kiếm sản phẩm:

1. Khi người dùng quét mã vạch hoặc gõ một đoạn mã ngắn, hệ thống trả về sản phẩm sai (do logic tìm kiếm cũ dùng `.includes()` lỏng lẻo trên chuỗi barcode, dẫn đến việc quét/gõ số nằm ở đuôi mã vạch dài của sản phẩm khác vẫn bị khớp nhầm).

2. Dù đã áp dụng một số bản vá ở giao diện, nhưng khi deploy lên Production (Vercel) hoặc đồng bộ state, lỗi vẫn tái diễn hoặc tìm ra mã này nhưng ra tên hàng khác. Nguyên nhân có thể do:

   - Các hook tải danh mục sản phẩm (như `useProducts.ts`, `useCatalogStockImport.ts`, v.v.) thiếu thứ tự sắp xếp phụ `.order('id', { ascending: true })`) gây lệch/sót dữ liệu khi phân trang 1000 dòng trên bảng lớn hơn 6500 sản phẩm.

   - Các file form như `CreateWarehouseOrderForm.tsx`, `BanKemDvPanel.tsx`, `WarehouseOrderDetail.tsx`[cite: 1, 2, 4] vẫn còn sót hàm lọc gợi ý `suggestions`) sử dụng cơ chế tìm kiếm chứa chuỗi thô `.includes()`) thay vì bắt buộc khớp chính xác hoặc tiền tố `===` hoặc `startsWith`).

Task yêu cầu bạn thực hiện:

1. Rà soát toàn bộ các file liên quan đến tìm kiếm sản phẩm `catalogSearch.ts`, các form nhập đơn, xuất bán, quản lý kho).

2. Tìm chính xác đoạn code đang gây ra lỗi "gõ mã này ra sản phẩm khác" hoặc "bản vá trước bị ghi đè/không ăn vào code".

3. Viết lại logic lọc mã vạch chuẩn tuyệt đối:

   - Barcode / Barcode_2: Phải ưu tiên khớp tuyệt đối `=== q`) hoặc khớp từ ký tự đầu `startsWith(q)`). 

   - Tuyệt đối KHÔNG dùng `.includes(q)` đơn thuần cho barcode trừ khi tên sản phẩm hoặc SKU thực sự khớp.

4. Kiểm tra lại toàn bộ các hàm phân trang tải danh mục sản phẩm từ Supabase để đảm bảo không bị sót dòng hay lệch dữ liệu do thiếu `.order("id", { ascending: true })`.

5. Trả về mã nguồn hoàn chỉnh, giải thích rõ nguyên nhân cũ và hướng dẫn cách build/deploy lại chính xác.