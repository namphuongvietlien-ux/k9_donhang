/** Conventions phiếu kho nội bộ K9 (DH đơn hàng / DT đơn thuốc / DC điều chuyển) */

export type OrderKind = "DH" | "DT" | "DC" | "XB" | "OTHER";

export type WarehouseOrderStatus =
  | "pending"
  | "processing"
  | "completed"
  | "cancelled";

export const WAREHOUSE_ORDER_KINDS: Array<"DH" | "DT" | "DC"> = ["DH", "DT", "DC"];
export const Q7_INTERNAL_KINDS: Array<"DH" | "DT"> = ["DH", "DT"];

export const WAREHOUSE_STATUS_LABELS: Record<string, string> = {
  pending: "Mới",
  processing: "Đã soạn hàng",
  completed: "Đã nhận hàng",
  cancelled: "Đã hủy",
};

/** Badge màu chuẩn K9 (GAS): Mới / Đã soạn / Đã nhận / Hủy */
export const WAREHOUSE_STATUS_BADGE: Record<string, string> = {
  pending:
    "bg-blue-100 text-blue-800 border border-blue-300 hover:bg-blue-100",
  processing:
    "bg-yellow-100 text-yellow-800 border border-yellow-300 hover:bg-yellow-100",
  completed:
    "bg-green-100 text-green-800 border border-green-300 hover:bg-green-100",
  cancelled:
    "bg-red-100 text-red-800 border border-red-300 hover:bg-red-100",
};

export const ORDER_KIND_LABELS: Record<OrderKind, string> = {
  DH: "Đơn hàng (DH)",
  DT: "Đơn thuốc (DT)",
  DC: "Điều chuyển (DC)",
  XB: "Xuất bán (XB)",
  OTHER: "Khác",
};

export function isQ7InternalKind(kind: string | null | undefined): boolean {
  return kind === "DH" || kind === "DT";
}

/** Tiền tố mã: DT / DH / DC / XB — chấp nhận có hoặc không có dấu gạch. */
export function inferOrderKind(orderCode: string | null | undefined): OrderKind {
  const compact = String(orderCode || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (compact.startsWith("DT")) return "DT";
  if (compact.startsWith("DH")) return "DH";
  if (compact.startsWith("DC")) return "DC";
  if (compact.startsWith("XB")) return "XB";
  return "OTHER";
}

export function isWarehouseOrderCode(orderCode: string | null | undefined): boolean {
  const k = inferOrderKind(orderCode);
  return k === "DH" || k === "DT" || k === "DC";
}

export function orderKindCustomerName(kind: string | null | undefined): string {
  if (kind === "DT") return "Đơn thuốc nội bộ";
  if (kind === "DH") return "Đơn hàng nội bộ";
  if (kind === "DC") return "Điều chuyển nội bộ";
  return "Phiếu kho nội bộ";
}
