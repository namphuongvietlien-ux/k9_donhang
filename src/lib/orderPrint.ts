/**
 * Port GAS print/PDF (app.js): HTML + window.print — không jsPDF.
 * SL in = qty_packed ?? qty_requested ?? quantity (ql_resolvePrintQty_).
 */

import * as XLSX from "xlsx";
import { format } from "date-fns";
import { warehouseShortLabel } from "@/lib/warehouseMeta";

export interface PrintOrderLine {
  stt?: number | null;
  maHang: string;
  tenHang: string;
  dvt: string;
  sl: number;
  maVach?: string;
  parentSku?: string;
  variantName?: string;
  isNew?: boolean;
  isLocked?: boolean;
}

export interface PrintOrderDetail {
  soPhieu: string;
  khoXuat: string;
  khoNhan: string;
  /** Địa chỉ kho xuất (in kèm) */
  diaChiXuat?: string | null;
  /** Địa chỉ kho nhận / chi nhánh */
  diaChiNhan?: string | null;
  thoiGianTao: string | Date;
  thoiGianCapNhat?: string | Date | null;
  items: PrintOrderLine[];
  status?: string;
}

/** SL dùng khi In / Excel — ưu tiên SL soạn */
export function resolvePrintQty(input: {
  status?: string | null;
  qtyPacked?: number | null;
  qtyRequested?: number | null;
  quantity?: number | null;
}): number {
  const s = String(input.status || "").toLowerCase();
  if (s === "cancelled" || s.includes("hủy") || s.includes("huy")) return 0;
  if (input.qtyPacked != null && input.qtyPacked !== undefined) {
    return Number(input.qtyPacked) || 0;
  }
  if (
    s === "processing" ||
    s === "completed" ||
    s.includes("soạn") ||
    s.includes("nhận")
  ) {
    if (input.qtyPacked != null) return Number(input.qtyPacked) || 0;
  }
  if (input.qtyRequested != null) return Number(input.qtyRequested) || 0;
  return Number(input.quantity) || 0;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatOrderTimestampUi(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function getPdfWindowSharedCss(): string {
  return (
    'body{font-family:"Segoe UI",Arial,sans-serif;margin:0;padding:12px;color:#0f172a;background:#f8fafc;}' +
    ".sheet{max-width:980px;margin:0 auto;background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:16px 18px;}" +
    ".toolbar{display:flex;gap:8px;justify-content:flex-end;margin-bottom:10px;flex-wrap:wrap;}" +
    ".btn-submit{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:#1d4ed8;color:#fff;border:none;padding:8px 14px;font-size:13px;font-weight:700;border-radius:8px;cursor:pointer;}" +
    ".order-code{margin:0 0 4px;font-size:18px;font-weight:800;color:#0f172a;}" +
    ".created-time{margin:0 0 8px;font-size:13px;font-weight:700;color:#1d4ed8;line-height:1.4;}" +
    ".meta{line-height:1.5;margin:0 0 10px;color:#334155;font-size:13px;}" +
    "table{width:100%;border-collapse:collapse;} th,td{border:1px solid #9ca3af;padding:3px 5px;font-size:13px;vertical-align:middle;}" +
    "th{background:#e2e8f0;text-align:left;font-weight:700;} .code,.code-cell{font-weight:700;font-size:13px;font-family:ui-monospace,Consolas,monospace;} .qty,.qty-cell{font-weight:800;text-align:center;font-size:14px;}" +
    ".note,.note-cell{width:64px;} .variant-line{margin-top:1px;font-size:11px;color:#64748b;}" +
    ".mv-line{display:block;font-size:11px;color:#64748b;font-weight:500;}" +
    ".signs{display:flex;justify-content:space-between;margin-top:36px;text-align:center;font-size:12px;}" +
    "@media print{.toolbar{display:none!important;} body{background:#fff;padding:0;} .sheet{box-shadow:none;border:none;border-radius:0;max-width:none;padding:0;page-break-after:always;} .sheet:last-child{page-break-after:auto;} @page{margin:8mm;size:A4 portrait;}}"
  );
}

function buildOrderPdfHeaderHtml(detail: PrintOrderDetail): string {
  const so = escapeHtml(detail.soPhieu || "");
  const tgTao = escapeHtml(
    formatOrderTimestampUi(detail.thoiGianTao) || String(detail.thoiGianTao || "—"),
  );
  const tgCap = escapeHtml(
    formatOrderTimestampUi(detail.thoiGianCapNhat) ||
      formatOrderTimestampUi(detail.thoiGianTao) ||
      "—",
  );
  const kx = escapeHtml(detail.khoXuat || "—");
  const kn = escapeHtml(detail.khoNhan || "—");
  const dx = String(detail.diaChiXuat || "").trim();
  const dn = String(detail.diaChiNhan || "").trim();
  return (
    `<div class="order-code">Đơn hàng: ${so}</div>` +
    `<div class="created-time">Ngày tạo: ${tgTao} &nbsp;|&nbsp; Cập nhật lần cuối: ${tgCap}</div>` +
    `<div class="meta"><b>Kho xuất:</b> ${kx}` +
    (dx ? `<br><span style="color:#64748b;">Địa chỉ xuất: ${escapeHtml(dx)}</span>` : "") +
    `<br><b>Kho nhận / Chi nhánh:</b> ${kn}` +
    (dn
      ? `<br><span style="color:#64748b;">Địa chỉ nhận: ${escapeHtml(dn)}</span>`
      : "") +
    `</div>`
  );
}

function sortPrintOrderItems<T extends { stt?: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aStt = Number(a.stt ?? Number.MAX_SAFE_INTEGER);
    const bStt = Number(b.stt ?? Number.MAX_SAFE_INTEGER);
    return aStt - bStt;
  });
}

export function buildOrderPdfSheetInnerHtml(detail: PrintOrderDetail): string {
  const headerHtml = buildOrderPdfHeaderHtml(detail);
  let rowsHtml = "";
  const orderedItems = sortPrintOrderItems(detail.items || []);
  // STT chạy liên tục theo dòng thực in ra (bỏ qua dòng SL <= 0 / dòng bị lọc)
  let stt = 0;
  orderedItems.forEach((it) => {
    const sl = Number(it.sl) || 0;
    if (sl <= 0) return;
    stt += 1;
    const parentCode = (it.parentSku || it.maHang || "").trim() || "—";
    const childCode = (it.maHang || "").trim();
    let variantLine = "";
    if (
      parentCode &&
      childCode &&
      parentCode.toUpperCase() !== childCode.toUpperCase()
    ) {
      variantLine =
        `<div class="variant-line">Phân loại: ${escapeHtml(it.variantName || it.tenHang || "")}` +
        ` · Mã con: ${escapeHtml(childCode)}</div>`;
    }
    const mv = String(it.maVach || "").trim();
    const mvLine = mv
      ? `<span class="mv-line">MV: ${escapeHtml(mv)}</span>`
      : "";
    const flagLine =
      (it.isNew
        ? `<span class="mv-line" style="color:#059669;font-weight:700;"> MỚI</span>`
        : "") +
      (it.isLocked
        ? `<span class="mv-line" style="color:#b91c1c;font-weight:700;"> KHÓA</span>`
        : "");
    const rowBg = it.isNew
      ? ' style="background:#ecfdf5;"'
      : it.isLocked
        ? ' style="background:#fef2f2;"'
        : "";
    rowsHtml +=
      `<tr${rowBg}><td>${stt}</td>` +
      `<td class="code">${escapeHtml(parentCode)}${mvLine}${flagLine}</td>` +
      `<td>${escapeHtml(it.tenHang)}${variantLine}</td>` +
      `<td>${escapeHtml(it.dvt || "")}</td>` +
      `<td class="qty">${sl}</td><td class="note"></td></tr>`;
  });
  if (!rowsHtml) {
    rowsHtml =
      '<tr><td colspan="6" style="text-align:center;color:#64748b;">Không có dòng hàng hợp lệ.</td></tr>';
  }
  return (
    `<div class="sheet">${headerHtml}` +
    `<table><thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng / Phân loại</th><th>ĐVT</th><th>SL</th><th class="note"></th></tr></thead><tbody>` +
    rowsHtml +
    `</tbody></table>` +
    `<div class="signs"><div><b>Người lập phiếu</b><br><br><br>Ký ghi rõ họ tên</div><div><b>Người nhận</b><br><br><br>Ký ghi rõ họ tên</div></div></div>`
  );
}

export function buildOrderPdfHtml(detail: PrintOrderDetail): string {
  const so = escapeHtml(detail.soPhieu || "");
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Đơn hàng ${so}</title>` +
    `<style>${getPdfWindowSharedCss()}</style></head><body>` +
    `<div class="toolbar"><button type="button" class="btn-submit" onclick="window.print()">🖨️ In PDF</button></div>` +
    buildOrderPdfSheetInnerHtml(detail) +
    `</body></html>`
  );
}

export function buildMultiOrderPdfHtml(
  details: PrintOrderDetail[],
  title?: string,
): string {
  const sheets = details.map((d) => buildOrderPdfSheetInnerHtml(d)).join("");
  const t = escapeHtml(title || `In ${details.length} đơn`);
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${t}</title>` +
    `<style>${getPdfWindowSharedCss()}</style></head><body>` +
    `<div class="toolbar"><button type="button" class="btn-submit" onclick="window.print()">🖨️ In PDF</button></div>` +
    sheets +
    `</body></html>`
  );
}

/** In ngay qua iframe ẩn (GAS executePrintWeb) */
export function printOrderViaIframe(detail: PrintOrderDetail): void {
  const html =
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Đơn hàng ${escapeHtml(detail.soPhieu)}</title>` +
    `<style>${getPdfWindowSharedCss()}</style></head><body>${buildOrderPdfSheetInnerHtml(detail)}</body></html>`;
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    openOrderPdfWindow(detail);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {
        /* ignore */
      }
    }, 1500);
  }, 400);
}

/** Mở tab mới xem + In PDF */
export function openOrderPdfWindow(detail: PrintOrderDetail): void {
  const w = window.open("", "_blank");
  if (!w) {
    alert("Trình duyệt chặn tab mới. Cho phép popup rồi thử lại.");
    return;
  }
  w.document.open();
  w.document.write(buildOrderPdfHtml(detail));
  w.document.close();
}

export function openMultiOrderPdfWindow(
  details: PrintOrderDetail[],
  title?: string,
): void {
  if (!details.length) {
    alert("Không có đơn để in.");
    return;
  }
  const w = window.open("", "_blank");
  if (!w) {
    alert("Trình duyệt chặn tab mới. Cho phép popup rồi thử lại.");
    return;
  }
  w.document.open();
  w.document.write(buildMultiOrderPdfHtml(details, title));
  w.document.close();
}

/** Xuất Excel client (thay GAS taoFileExcelVaLayLink) — cột Số lượng (Soạn) */
export function exportOrderExcel(detail: PrintOrderDetail): void {
  const rows: (string | number)[][] = [
    ["Số phiếu", detail.soPhieu],
    ["Kho xuất", detail.khoXuat],
    ["Kho nhận", detail.khoNhan],
    [
      "Ngày tạo",
      formatOrderTimestampUi(detail.thoiGianTao) || String(detail.thoiGianTao || ""),
    ],
    [],
    ["STT", "Mã hàng", "Mã vạch", "Tên hàng", "ĐVT", "Số lượng (Soạn)"],
  ];
  const orderedItems = sortPrintOrderItems(detail.items || []);
  // STT chạy liên tục theo dòng thực xuất ra Excel
  let stt = 0;
  orderedItems.forEach((it) => {
    if ((Number(it.sl) || 0) <= 0) return;
    stt += 1;
    rows.push([
      stt,
      it.parentSku || it.maHang,
      it.maVach || "",
      it.tenHang,
      it.dvt || "",
      Number(it.sl) || 0,
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Phieu");
  const code = (detail.soPhieu || "phieu").replace(/[^\w.-]+/g, "_");
  XLSX.writeFile(wb, `${code}_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
}

/** Map WarehouseOrder → PrintOrderDetail */
export function warehouseOrderToPrintDetail(order: {
  order_code: string | null;
  status: string;
  created_at: string;
  updated_at?: string | null;
  source_warehouse?: {
    code: string;
    name: string;
    address?: string | null;
    short_name?: string | null;
    print_name?: string | null;
  } | null;
  warehouse?: {
    code: string;
    name: string;
    address?: string | null;
    short_name?: string | null;
    print_name?: string | null;
  } | null;
  order_items: Array<{
    product_name: string;
    product_slug: string | null;
    quantity: number;
    qty_requested?: number | null;
    qty_packed?: number | null;
    barcode?: string | null;
    unit?: string | null;
    /**
     * ĐVT / MV đang hiển thị trên lưới web (đã resolve theo catalog + draft chưa
     * lưu). Có giá trị thì thắng snapshot `unit` / `barcode` của order_items —
     * In & Excel phải khớp đúng những gì người dùng đang thấy.
     */
    display_unit?: string | null;
    display_barcode?: string | null;
  }>;
}): PrintOrderDetail {
  const label = (w: {
    code: string;
    short_name?: string | null;
    print_name?: string | null;
    name?: string | null;
  } | null | undefined) => warehouseShortLabel(w);

  return {
    soPhieu: order.order_code || "—",
    khoXuat: label(order.source_warehouse),
    khoNhan: label(order.warehouse),
    diaChiXuat: order.source_warehouse?.address || null,
    diaChiNhan: order.warehouse?.address || null,
    thoiGianTao: order.created_at,
    thoiGianCapNhat: order.updated_at || order.created_at,
    status: order.status,
    items: sortPrintOrderItems(
      order.order_items.map((it) => ({
        stt: Number((it as { stt?: number | null }).stt ?? 0) || null,
        maHang: it.product_slug || "",
        tenHang: it.product_name,
        dvt: String(it.display_unit ?? "").trim() || it.unit || "",
        maVach: String(it.display_barcode ?? "").trim() || it.barcode || "",
        parentSku: it.product_slug || "",
        sl: resolvePrintQty({
          status: order.status,
          qtyPacked: it.qty_packed,
          qtyRequested: it.qty_requested,
          quantity: it.quantity,
        }),
      })),
    ),
  };
}
