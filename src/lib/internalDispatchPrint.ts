/**
 * In phiếu đơn tuần xuất nội bộ — tách phiếu riêng cho từng chi nhánh nhận.
 *
 * Đơn tuần gộp SL theo mã hàng nên nếu in thẳng sẽ ra một phiếu trộn số liệu
 * của mọi chi nhánh. Helper này nhận sẵn danh sách dòng hàng ĐÃ tách theo chi
 * nhánh, mỗi chi nhánh một trang (page-break), STT luôn chạy lại từ 1.
 */

export interface WeeklyPrintLine {
  productCode: string;
  productName: string;
  unit: string | null;
  quantity: number;
}

export interface WeeklyBranchSheet {
  /** Nhãn chi nhánh nhận hiển thị trên phiếu (Q4 Mới, Q8, …) */
  branchLabel: string;
  lines: WeeklyPrintLine[];
}

export interface WeeklyPrintOptions {
  weekStart: string;
  statusLabel: string;
  sheets: WeeklyBranchSheet[];
  /** Ngày in — truyền vào để test được, mặc định hôm nay. */
  printedAt?: Date;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateVn(value: string | Date): string {
  const date =
    value instanceof Date ? value : new Date(`${String(value)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("vi-VN");
}

const PRINT_CSS = `
  *{box-sizing:border-box;}
  body{margin:0;font-family:"Segoe UI",Arial,sans-serif;color:#111827;font-size:11pt;line-height:1.35;}
  .toolbar{padding:10px 14px;background:#f1f5f9;border-bottom:1px solid #cbd5e1;}
  .toolbar button{padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;}
  .sheet{padding:14mm 13mm;}
  .sheet + .sheet{border-top:2px dashed #cbd5e1;}
  .head{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;
    border-bottom:2px solid #111827;padding-bottom:12px;margin-bottom:18px;}
  .eyebrow{margin:0 0 8px;font-size:8.5pt;font-weight:700;letter-spacing:.08em;color:#334155;}
  h1{margin:0;font-size:18pt;line-height:1.15;}
  .subtitle{margin:6px 0 0;font-style:italic;}
  .branch{margin:8px 0 0;font-size:12pt;font-weight:700;}
  .meta{min-width:190px;font-size:10pt;}
  .meta p{margin:0 0 5px;}
  table{width:100%;border-collapse:collapse;table-layout:fixed;}
  th,td{border:1px solid #374151;padding:7px 8px;vertical-align:middle;}
  th{background:#e5e7eb;font-size:9pt;text-transform:uppercase;letter-spacing:.04em;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  th:nth-child(1){width:8%;} th:nth-child(2){width:18%;} th:nth-child(3){width:45%;}
  th:nth-child(4){width:12%;} th:nth-child(5){width:17%;}
  td:first-child,td:nth-child(4),.qty{text-align:center;}
  .code{font-family:"Courier New",monospace;font-size:9.5pt;}
  tfoot td{background:#f3f4f6;font-weight:700;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .empty{text-align:center;color:#64748b;font-style:italic;}
  .signs{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:34px;text-align:center;}
  .signs strong,.signs span{display:block;}
  .signs span{margin-top:4px;font-size:9pt;font-style:italic;}
  @media print{
    .toolbar{display:none!important;}
    .sheet{padding:0;}
    .sheet + .sheet{border-top:0;break-before:page;page-break-before:always;}
    @page{size:A4 portrait;margin:14mm 13mm;}
  }
`;

function buildSheetHtml(
  sheet: WeeklyBranchSheet,
  options: { weekStart: string; statusLabel: string; printedAt: Date },
): string {
  // STT dùng biến đếm riêng để mỗi phiếu chi nhánh luôn chạy 1,2,3… liên tục
  let stt = 0;
  const bodyRows = sheet.lines
    .map((line) => {
      stt += 1;
      return (
        `<tr><td>${stt}</td>` +
        `<td class="code">${escapeHtml(line.productCode)}</td>` +
        `<td>${escapeHtml(line.productName)}</td>` +
        `<td>${escapeHtml(line.unit || "—")}</td>` +
        `<td class="qty">${line.quantity}</td></tr>`
      );
    })
    .join("");
  const totalQty = sheet.lines.reduce(
    (sum, line) => sum + Number(line.quantity || 0),
    0,
  );

  return (
    `<section class="sheet">` +
    `<div class="head"><div>` +
    `<p class="eyebrow">K9 · QUẢN LÝ KHO &amp; ĐƠN HÀNG</p>` +
    `<h1>PHIẾU XUẤT NỘI BỘ THEO CHI NHÁNH</h1>` +
    `<p class="subtitle">Hàng hóa đã được quản lý chi nhánh phê duyệt</p>` +
    `<p class="branch">Chi nhánh nhận: ${escapeHtml(sheet.branchLabel)}</p>` +
    `</div><div class="meta">` +
    `<p><strong>Tuần từ:</strong> ${escapeHtml(formatDateVn(options.weekStart))}</p>` +
    `<p><strong>Ngày in:</strong> ${escapeHtml(formatDateVn(options.printedAt))}</p>` +
    `<p><strong>Trạng thái:</strong> ${escapeHtml(options.statusLabel)}</p>` +
    `<p><strong>Số dòng:</strong> ${sheet.lines.length}</p>` +
    `</div></div>` +
    `<table><thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th><th>Tổng SL</th></tr></thead>` +
    `<tbody>${bodyRows || '<tr><td colspan="5" class="empty">Chi nhánh này không có dòng hàng.</td></tr>'}</tbody>` +
    `<tfoot><tr><td colspan="4">TỔNG CỘNG</td><td class="qty">${totalQty}</td></tr></tfoot></table>` +
    `<div class="signs">` +
    `<div><strong>NGƯỜI LẬP</strong><span>(Ký, ghi rõ họ tên)</span></div>` +
    `<div><strong>QUẢN LÝ DUYỆT</strong><span>(Ký, ghi rõ họ tên)</span></div>` +
    `<div><strong>THỦ KHO / TỔNG CÔNG TY</strong><span>(Ký, ghi rõ họ tên)</span></div>` +
    `</div></section>`
  );
}

export function buildWeeklyBranchPrintHtml(options: WeeklyPrintOptions): string {
  const printedAt = options.printedAt || new Date();
  const sheets = options.sheets.filter((sheet) => sheet.lines.length > 0);
  const inner = sheets.length
    ? sheets
        .map((sheet) =>
          buildSheetHtml(sheet, {
            weekStart: options.weekStart,
            statusLabel: options.statusLabel,
            printedAt,
          }),
        )
        .join("")
    : `<section class="sheet"><p class="empty">Không có dòng hàng để in.</p></section>`;

  return (
    `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">` +
    `<title>Phiếu xuất nội bộ tuần ${escapeHtml(formatDateVn(options.weekStart))}</title>` +
    `<style>${PRINT_CSS}</style></head><body>` +
    `<div class="toolbar"><button type="button" onclick="window.print()">🖨️ In ${sheets.length} phiếu</button></div>` +
    inner +
    `</body></html>`
  );
}

/** Mở tab in với mỗi chi nhánh một phiếu riêng. Trả false nếu popup bị chặn. */
export function openWeeklyBranchPrintWindow(
  options: WeeklyPrintOptions,
): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(buildWeeklyBranchPrintHtml(options));
  w.document.close();
  setTimeout(() => {
    w.focus();
    w.print();
  }, 350);
  return true;
}
