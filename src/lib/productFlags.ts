/** Cờ thị giác SP — port GAS IsNew / IsOutStock / IsLocked */

export interface ProductVisualFlags {
  is_new?: boolean | null;
  is_out_stock?: boolean | null;
  is_locked?: boolean | null;
}

export function isTruthyFlag(v: unknown): boolean {
  if (v === true || v === 1) return true;
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "x";
}

/** Ghi chú mềm / notes chứa LỖI (GAS soft line errors) */
export function hasLoiNote(text: string | null | undefined): boolean {
  if (!text) return false;
  return /lỗi|loi\b/i.test(text);
}

export type QtyMismatchKind = "short" | "over" | null;

/** So sánh SL soạn vs yêu cầu (chỉ khi đã có qty_packed) */
export function qtyMismatchKind(
  qtyRequested: number | null | undefined,
  qtyPacked: number | null | undefined,
): QtyMismatchKind {
  if (qtyPacked == null) return null;
  const req = Number(qtyRequested) || 0;
  const packed = Number(qtyPacked) || 0;
  if (packed < req) return "short";
  if (packed > req) return "over";
  return null;
}

export const QTY_MISMATCH_ROW: Record<"short" | "over", string> = {
  short: "bg-[#f4cccc]/80 text-red-900",
  over: "bg-yellow-50 text-amber-950",
};

export const QTY_MISMATCH_HINT: Record<"short" | "over", string> = {
  short: "Thiếu soạn (SL soạn < yêu cầu)",
  over: "Thừa soạn (SL soạn > yêu cầu)",
};
