Trong file `src/components/admin/WarehouseOrderDetail.tsx`:

1. Tại hàm `resolveAddPayload`: Sửa logic lấy trường `unit` để ưu tiên lấy đúng giá trị `newUnit` đang chọn trên giao diện `unit = newUnit.trim() || ...`), không tự động fallback về đơn vị cơ bản `hit.unit`.

2. Tại Select ĐVT (khoảng dòng 480): Sửa thuộc tính `value={newUnit || addUnitOptions[0]?.unit || ""}` để tránh việc Dropdown tự nhảy về phần tử đầu tiên `addUnitOptions[0]`).

3. Đảm bảo khi gọi `addItem.mutateAsync(...)`, trường `unit` truyền đi là giá trị chính xác của ĐVT đang chọn trên dropdown (ví dụ: "Bao", "Thùng"), không bị ép về đơn vị gốc của catalog.