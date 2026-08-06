/**
 * In PDF hóa đơn Xuất bán (XB) — port GAS buildInvoicePdfHtml_.
 * Tách Hàng vật lý / Dịch vụ đi kèm.
 */

import { format } from "date-fns";
import { getPdfWindowSharedCss } from "@/lib/orderPrint";

export interface SalesInvoicePrintLine {
  maHang: string;
  maVach?: string | null;
  tenHang: string;
  dvt?: string | null;
  sl: number;
  donGia?: number;
  chiPhiDv?: number;
  thanhTien: number;
  lineKind: "HANG" | "DV" | string;
}

export interface SalesInvoicePrintDetail {
  soHoaDon: string;
  maPhieu: string;
  chiNhanh: string;
  thoiGian: string | Date;
  actor?: string | null;
  status?: string | null;
  items: SalesInvoicePrintLine[];
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoneyVn(n: unknown): string {
  const x = Number(n);
  if (!x || Number.isNaN(x)) return "0";
  return Math.round(x).toLocaleString("vi-VN");
}

function fmtTime(v: string | Date): string {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return String(v || "—");
  return format(d, "HH:mm dd/MM/yyyy");
}

export function buildSalesInvoicePdfHtml(detail: SalesInvoicePrintDetail): string {
  const so = escapeHtml(detail.soHoaDon || "—");
  const mp = escapeHtml(detail.maPhieu || "—");
  const cn = escapeHtml(detail.chiNhanh || "—");
  const tg = escapeHtml(fmtTime(detail.thoiGian));
  const actor = escapeHtml(detail.actor || "—");
  const st = String(detail.status || "saved").toLowerCase();
  const cancelled = st === "cancelled" || st.includes("hủy");

  const products = (detail.items || []).filter(
    (it) => String(it.lineKind || "HANG").toUpperCase() !== "DV",
  );
  const services = (detail.items || []).filter(
    (it) => String(it.lineKind || "").toUpperCase() === "DV",
  );

  let productsHtml = "";
  let stt = 1;
  for (const it of products) {
    productsHtml +=
      `<tr><td>${stt++}</td>` +
      `<td class="code">${escapeHtml(it.maHang || "—")}` +
      (it.maVach
        ? `<br><small>MV: ${escapeHtml(it.maVach)}</small>`
        : "") +
      `</td>` +
      `<td>${escapeHtml(it.tenHang || "—")}</td>` +
      `<td>${escapeHtml(it.dvt || "")}</td>` +
      `<td class="qty">${Number(it.sl) || 0}</td>` +
      `<td class="money">${formatMoneyVn(it.donGia)}</td>` +
      `<td class="money">${formatMoneyVn(it.thanhTien)}</td></tr>`;
  }
  if (!productsHtml) {
    productsHtml =
      '<tr><td colspan="7" style="text-align:center;color:#64748b;">Không có hàng hóa vật lý.</td></tr>';
  }

  let servicesHtml = "";
  let sttDv = 1;
  for (const sv of services) {
    servicesHtml +=
      `<tr><td>${sttDv++}</td>` +
      `<td class="code">${escapeHtml(sv.maHang || "—")}</td>` +
      `<td>${escapeHtml(sv.tenHang || "—")}</td>` +
      `<td class="qty">${Number(sv.sl) || 1}</td>` +
      `<td class="money">${formatMoneyVn(sv.chiPhiDv)}</td>` +
      `<td class="money">${formatMoneyVn(sv.thanhTien)}</td></tr>`;
  }
  if (!servicesHtml) {
    servicesHtml =
      '<tr><td colspan="6" style="text-align:center;color:#64748b;">Không có dịch vụ đi kèm trên phiếu này.</td></tr>';
  }

  const tongHang = products.reduce((s, i) => s + (Number(i.thanhTien) || 0), 0);
  const tongDv = services.reduce((s, i) => s + (Number(i.thanhTien) || 0), 0);
  const tongAll = tongHang + tongDv;

  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Hóa đơn ${so}</title>` +
    `<style>${getPdfWindowSharedCss()}` +
    "h2{margin:16px 0 6px;font-size:14px;color:#1e40af;}" +
    ".money{text-align:right;font-weight:600;}" +
    ".totals{margin-top:14px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;line-height:1.7;font-size:13px;}" +
    ".totals .grand{font-size:15px;font-weight:800;}" +
    ".badge-cancel{display:inline-block;margin-left:8px;padding:2px 8px;background:#fee2e2;color:#b91c1c;font-size:12px;font-weight:700;border-radius:6px;}" +
    "</style></head><body>" +
    `<div class="toolbar"><button type="button" class="btn-submit" onclick="window.print()">🖨️ In Hóa Đơn</button></div>` +
    `<div class="sheet"><div class="order-code">Hóa đơn: ${so}` +
    (cancelled ? `<span class="badge-cancel">ĐÃ HỦY</span>` : "") +
    `</div>` +
    `<div class="created-time">Ngày chứng từ: ${tg}</div>` +
    `<div class="meta"><b>Mã phiếu XB:</b> ${mp}<br><b>Chi nhánh:</b> ${cn}<br><b>Người tạo:</b> ${actor}</div>` +
    `<h2>1. Hàng hóa vật lý</h2>` +
    `<table><thead><tr><th>STT</th><th>SKU</th><th>Tên SP</th><th>ĐVT</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>${productsHtml}</tbody></table>` +
    `<h2>2. Dịch vụ đi kèm</h2>` +
    `<table><thead><tr><th>STT</th><th>Mã DV</th><th>Tên dịch vụ</th><th>SL</th><th>Chi phí DV</th><th>Thành tiền</th></tr></thead><tbody>${servicesHtml}</tbody></table>` +
    `<div class="totals"><div>Tổng tiền hàng: <b>${formatMoneyVn(tongHang)}</b></div>` +
    `<div>Tổng tiền dịch vụ: <b>${formatMoneyVn(tongDv)}</b></div>` +
    `<div class="grand">Tổng cộng: ${formatMoneyVn(tongAll)}</div></div></div></body></html>`
  );
}

export function openSalesInvoicePdfWindow(detail: SalesInvoicePrintDetail): void {
  const w = window.open("", "_blank");
  if (!w) {
    alert("Trình duyệt chặn popup. Cho phép rồi thử lại.");
    return;
  }
  w.document.open();
  w.document.write(buildSalesInvoicePdfHtml(detail));
  w.document.close();
}

/** Map voucher + items → print detail */
export function salesVoucherToPrintDetail(v: {
  voucher_code: string;
  invoice_no: string;
  warehouse_code?: string | null;
  warehouse_name?: string | null;
  created_at: string;
  created_by?: string | null;
  status?: string | null;
  sales_voucher_items?: Array<{
    product_slug?: string | null;
    barcode?: string | null;
    product_name: string;
    unit?: string | null;
    quantity: number;
    unit_price?: number;
    service_cost?: number | null;
    line_total?: number;
    line_kind?: string;
  }>;
}): SalesInvoicePrintDetail {
  return {
    soHoaDon: v.invoice_no,
    maPhieu: v.voucher_code,
    chiNhanh: v.warehouse_name || v.warehouse_code || "—",
    thoiGian: v.created_at,
    actor: v.created_by,
    status: v.status,
    items: (v.sales_voucher_items || []).map((it) => ({
      maHang: it.product_slug || "",
      maVach: it.barcode,
      tenHang: it.product_name,
      dvt: it.unit,
      sl: Number(it.quantity) || 0,
      donGia: Number(it.unit_price) || 0,
      chiPhiDv: Number(it.service_cost) || 0,
      thanhTien: Number(it.line_total) || 0,
      lineKind: it.line_kind || "HANG",
    })),
  };
}
