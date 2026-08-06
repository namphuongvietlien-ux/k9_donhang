# Sample data từ Google Sheet GAS cũ

File gốc copy từ `Downloads` (không commit bắt buộc):

| File | Nguồn |
|------|--------|
| `transfers.xlsx` | Copy of Điều Chuyển hàng.xlsx — workbook chính |
| `catalog.xlsx` | Nhap_khau_cap_nhat_thong_tin_hang_hoa |
| `stock.xlsx` | TỔNG HỢP TỒN KHO |
| `products.xlsx` | Danh sách hàng hóa |
| `transfers_form.xlsx` | form workbook |

Seed mặc định đọc `transfers.xlsx` (Data_Excel + TON_Q7 + Lịch Sử Xuất Kho):

```bash
npm run seed:gas
```
