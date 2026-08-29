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
import ExcelJS from "exceljs";

export const KIOTVIET_TRANSFER_SHEET = "Nhập khẩu hàng hóa lệnh";
/** Dữ liệu bắt đầu ở dòng 6 của file Excel (1-based). */
export const KIOTVIET_TRANSFER_DATA_ROW = 6;
/** File mẫu KiotViet nằm trong public/ */
export const KIOTVIET_TRANSFER_TEMPLATE_URL =
  "/nhap_khau_phieu_lenh_dieu_chuyen.xlsx";
/** Chuỗi cột "Kho (*)" của kho soạn hàng Q7 (KiotViet yêu cầu `MÃKHO | Tên kho`). */
export const KIOTVIET_Q7_WAREHOUSE =
  "KHODDKD0007 | Kho Địa điểm kinh doanh Q7";

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

/**
 * Xuất bằng cách ghi thẳng vào file mẫu KiotViet trong public/ (giữ nguyên
 * header, ràng buộc và style của mẫu — giống nút "Xuất lệnh điều chuyển" ở
 * Bảng tổng hợp soạn hàng). Trả false nếu không đọc được mẫu để caller fallback.
 */
export async function exportKiotVietTransferFromTemplate(
  lines: TransferExportLine[],
  options?: {
    khoLabel?: string | null;
    fileName?: string;
    templateUrl?: string;
  },
): Promise<boolean> {
  const response = await fetch(
    options?.templateUrl || KIOTVIET_TRANSFER_TEMPLATE_URL,
  );
  if (!response.ok) return false;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const worksheet = workbook.getWorksheet(KIOTVIET_TRANSFER_SHEET);
  if (!worksheet) return false;

  const firstDataRow = KIOTVIET_TRANSFER_DATA_ROW;
  const templateRow = worksheet.getRow(firstDataRow);
  const lastColumn = Math.max(worksheet.columnCount, HEADER_ROW.length);

  // Dọn dữ liệu cũ của mẫu trước khi dán dòng mới
  for (let row = firstDataRow; row <= worksheet.rowCount; row += 1) {
    for (let column = 1; column <= lastColumn; column += 1) {
      worksheet.getRow(row).getCell(column).value = null;
    }
  }

  lines.forEach((line, index) => {
    const rowNumber = firstDataRow + index;
    const targetRow = worksheet.getRow(rowNumber);
    if (rowNumber > firstDataRow) {
      targetRow.height = templateRow.height;
      for (let column = 1; column <= lastColumn; column += 1) {
        targetRow.getCell(column).style = {
          ...templateRow.getCell(column).style,
        };
      }
    }
    lineToRow(line, options?.khoLabel).forEach((value, columnIndex) => {
      const cell = targetRow.getCell(columnIndex + 1);
      cell.value =
        typeof value === "number" ? value : String(value ?? "") || null;
    });
    targetRow.commit();
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download =
    options?.fileName ||
    `nhap-khau-phieu-lenh-dieu-chuyen-${new Date().toISOString().slice(0, 10)}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
  return true;
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
