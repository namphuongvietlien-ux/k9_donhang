/** Conventions phiếu kho nội bộ K9 (port GAS DH/DC lifecycle) */

export type OrderKind = "DH" | "DC" | "XB" | "OTHER";

export type WarehouseOrderStatus =
  | "pending"
  | "processing"
  | "completed"
  | "cancelled";

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
  DC: "Điều chuyển (DC)",
  XB: "Xuất bán (XB)",
  OTHER: "Khác",
};

export function inferOrderKind(orderCode: string | null | undefined): OrderKind {
  const c = (orderCode || "").toUpperCase();
  if (c.startsWith("DH-")) return "DH";
  if (c.startsWith("DC-")) return "DC";
  if (c.startsWith("XB-")) return "XB";
  return "OTHER";
}

export function isWarehouseOrderCode(orderCode: string | null | undefined): boolean {
  const k = inferOrderKind(orderCode);
  return k === "DH" || k === "DC";
}
