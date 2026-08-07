/**
 * Fallback nhãn + địa chỉ kho khi DB chưa có cột address/short_name.
 *
 * Theo nghiệp vụ K9 (xác nhận 2026-08):
 * - Kho Địa điểm kinh doanh 06 (code Q4_275) = Q4 Cũ
 * - Kho Địa điểm kinh doanh 01 (code Q4_178) = Q4 Mới
 *
 * Code DB vẫn là Q4_178 / Q4_275 — UI luôn hiện Q4 Mới / Q4 Cũ.
 */
export const WAREHOUSE_PRINT_META: Record<
  string,
  { short_name: string; print_name: string; address: string }
> = {
  Q7: {
    short_name: "Q7",
    print_name: "Q7",
    address: "Kho Q7 — Lê Văn Lương, P. Tân Hưng, Q.7, TP.HCM",
  },
  Q8: {
    short_name: "Q8",
    print_name: "Q8",
    address: "86 Dương Bá Trạc, Q.8, TP.HCM",
  },
  PH: {
    short_name: "PH",
    print_name: "PH",
    address: "237 Phạm Hùng, Q.8, TP.HCM",
  },
  Q5: {
    short_name: "Q5",
    print_name: "Q5",
    address: "7 Trần Hưng Đạo, Q.5, TP.HCM",
  },
  Q1: {
    short_name: "Q1",
    print_name: "Q1",
    address: "140 Nguyễn Văn Cừ, Q.1, TP.HCM",
  },
  Q4_178: {
    short_name: "Q4 Mới",
    print_name: "Q4 Mới",
    address: "178 Hoàng Diệu, Q.4, TP.HCM",
  },
  Q4_275: {
    short_name: "Q4 Cũ",
    print_name: "Q4 Cũ",
    address: "275 Hoàng Diệu, Q.4, TP.HCM",
  },
};

/** Tên đầy đủ GAS → nhãn hiển thị (không dùng Q4_178 / Q4_275 trên UI). */
export const STORE_DISPLAY_LABELS: Record<string, string> = {
  "Kho Địa điểm kinh doanh Q7": "Q7",
  "Kho Địa điểm kinh doanh 01": "Q4 Mới",
  "Kho Địa điểm kinh doanh 02": "Q8",
  "Kho Địa điểm kinh doanh 03": "PH",
  "Kho Địa điểm kinh doanh 04": "Q5",
  "Kho Địa điểm kinh doanh 05": "Q1",
  "Kho Địa điểm kinh doanh 06": "Q4 Cũ",
};

/** Nhãn UI bắt buộc theo code — ghi đè short_name sai trong DB (vd còn Q4_275). */
export function forcedWarehouseShortName(
  code: string | null | undefined,
): string | null {
  const c = String(code || "").trim();
  if (!c) return null;
  return WAREHOUSE_PRINT_META[c]?.short_name ?? null;
}

export function enrichWarehouseMeta<
  T extends {
    code?: string | null;
    address?: string | null;
    short_name?: string | null;
    print_name?: string | null;
  },
>(w: T | null | undefined): T | null {
  if (!w?.code) return (w as T) || null;
  const fb = WAREHOUSE_PRINT_META[w.code];
  if (!fb) return w;
  // Luôn ép short/print theo bảng chuẩn — tránh DB còn Q4_178/Q4_275 làm nhãn
  return {
    ...w,
    short_name: fb.short_name,
    print_name: fb.print_name,
    address: w.address || fb.address,
  };
}

/** Nhãn ngắn luôn ưu tiên Q4 Cũ / Q4 Mới (không hiện Q4_275 / Q4_178). */
export function warehouseShortLabel(
  w:
    | {
        code?: string | null;
        short_name?: string | null;
        print_name?: string | null;
        name?: string | null;
      }
    | null
    | undefined,
): string {
  if (!w) return "—";
  const forced = forcedWarehouseShortName(w.code);
  if (forced) return forced;
  const e = enrichWarehouseMeta(w);
  const label =
    String(e?.short_name || "").trim() ||
    String(e?.print_name || "").trim() ||
    String(w.code || "").trim() ||
    "—";
  // Phòng trường hợp code lạ nhưng short_name vẫn là Q4_xxx
  if (label === "Q4_178") return "Q4 Mới";
  if (label === "Q4_275") return "Q4 Cũ";
  return label;
}
