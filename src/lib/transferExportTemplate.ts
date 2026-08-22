/**
 * Xuất phiếu điều chuyển theo ĐÚNG mẫu KiotViet `nhap_khau_phieu_lenh_dieu_chuyen.xlsx`.
 *
 * Layout mẫu (sheet "Nhập khẩu hàng hóa lệnh"):
 *   row 1 : trống
 *   row 2 : "DANH MỤC HÀNG HÓA LỆNH ĐIỀU CHUYỂN"
 *   row 3 : header cột
 *   row 4 : ràng buộc ("Bắt buộc")
 *   row 5 : mô tả cách nhập
 *   row 6+: DỮ LIỆU  ← dán từ dòng 6
 *
 * Cột "Kho (*)" của KiotViet cần dạng `MÃKHO | Tên kho`
 * (vd `KHODDKD0007 | Kho Địa điểm kinh doanh Q7`). Bảng `warehouses` không lưu
 * mã kho KiotViet, nên truyền `khoLabel` đúng chuỗi đó nếu muốn import thẳng.
 */
import * as XLSX from "xlsx";

export const KIOTVIET_TRANSFER_SHEET = "Nhập khẩu hàng hóa lệnh";
/** Dữ liệu bắt đầu ở dòng 6 của file Excel (1-based). */
export const KIOTVIET_TRANSFER_DATA_ROW = 6;

export interface TransferExportLine {
  maHang: string;
  maVach?: string | null;
  tenHang?: string | null;
  soLo?: string | null;
  hanSuDung?: string | null;
  /** Chuỗi kho KiotViet: `MÃKHO | Tên kho` */
  kho?: string | null;
  viTri?: string | null;
  dvt: string;
  soLuong: number;
  ghiChu?: string | null;
}

const TITLE_ROW = ["DANH MỤC HÀNG HÓA LỆNH ĐIỀU CHUYỂN"];

const HEADER_ROW = [
  "Mã hàng hóa (*)",
  "Mã vạch (*)",
  "Tên hàng hóa",
  "Số lô",
  "Hạn sử dụng",
  "Kho (*)",
  "Vị trí lưu kho",
  "Đơn vị tính (*)",
  "Số lượng (*)",
  "Ghi chú",
];

const REQUIRED_ROW = [
  "Không bắt buộc nhập đồng thời cột Mã vạch và cột Mã SKU",
  "",
  "",
  "",
  "",
  "Bắt buộc",
  "",
  "Bắt buộc",
  "Bắt buộc",
  "",
];

const DESCRIPTION_ROW = [
  "",
  "",
  "Nhập tên của hàng hóa muốn điều chuyển",
  "Nhập số lô của hàng hóa muốn điều chuyển",
  "Nhập hạn sử dụng của hàng hóa muốn điều chuyển",
  "Chọn kho",
  "Chọn vị trí lưu kho của kho điều chuyển",
  "Nhập đơn vị tính của hàng hóa xuất",
  "Nhập số lượng hàng hóa muốn điều chuyển",
  "Nhập ghi chú cho hàng hóa",
];

const COL_WIDTHS = [
  { wch: 20 }, { wch: 18 }, { wch: 40 }, { wch: 12 }, { wch: 14 },
  { wch: 34 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 26 },
];

function lineToRow(line: TransferExportLine, fallbackKho?: string | null): unknown[] {
  return [
    String(line.maHang || "").trim(),
    String(line.maVach || "").trim(),
    String(line.tenHang || "").trim(),
    String(line.soLo || "").trim(),
    String(line.hanSuDung || "").trim(),
    String(line.kho || fallbackKho || "").trim(),
    String(line.viTri || "").trim(),
    String(line.dvt || "").trim(),
    Number(line.soLuong) || 0,
    String(line.ghiChu || "").trim(),
  ];
}

export function buildKiotVietTransferWorkbook(
  lines: TransferExportLine[],
  options?: { khoLabel?: string | null },
): XLSX.WorkBook {
  const aoa: unknown[][] = [
    [],               // row 1 — trống như mẫu
    TITLE_ROW,        // row 2
    HEADER_ROW,       // row 3
    REQUIRED_ROW,     // row 4
    DESCRIPTION_ROW,  // row 5
  ];
  for (const line of lines) {
    aoa.push(lineToRow(line, options?.khoLabel)); // row 6+
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = COL_WIDTHS;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, KIOTVIET_TRANSFER_SHEET);
  return workbook;
}

export function exportKiotVietTransferFile(
  lines: TransferExportLine[],
  options?: { khoLabel?: string | null; fileName?: string },
): void {
  const workbook = buildKiotVietTransferWorkbook(lines, {
    khoLabel: options?.khoLabel,
  });
  const name =
    options?.fileName ||
    `nhap-khau-phieu-lenh-dieu-chuyen-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, name);
}
