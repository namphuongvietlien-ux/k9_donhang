/** Trạng thái điều chuyển nội bộ K9 */
export type TransferStatus =
  | "pending_confirm"
  | "in_transit"
  | "received"
  | "mismatch";

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  pending_confirm: "Chờ xác nhận",
  in_transit: "Đang luân chuyển",
  received: "Đã nhận",
  mismatch: "Sai lệch",
};

export const TRANSFER_STATUS_BADGE: Record<TransferStatus, string> = {
  pending_confirm: "bg-amber-100 text-amber-900 hover:bg-amber-100",
  in_transit: "bg-sky-100 text-sky-900 hover:bg-sky-100",
  received: "bg-emerald-100 text-emerald-900 hover:bg-emerald-100",
  mismatch: "bg-destructive/15 text-destructive hover:bg-destructive/15",
};

/** Map status phiếu orders → trạng thái điều chuyển */
export function mapOrderStatusToTransfer(
  orderStatus: string | null | undefined,
  qtyShipped: number,
  qtyReceived: number | null,
): TransferStatus {
  if (
    qtyReceived != null &&
    qtyShipped > 0 &&
    qtyReceived !== qtyShipped
  ) {
    return "mismatch";
  }

  const s = (orderStatus || "").toLowerCase();
  if (s === "cancelled" || s === "canceled") {
    // Hủy không hiển thị như sai lệch SL — giữ pending_confirm để lọc riêng nếu cần
    return "pending_confirm";
  }
  if (s === "completed" || s === "delivered") return "received";
  if (s === "processing" || s === "shipping" || s === "shipped") {
    return "in_transit";
  }
  return "pending_confirm";
}

export function isActiveTransferStatus(status: TransferStatus): boolean {
  return status === "pending_confirm" || status === "in_transit";
}
