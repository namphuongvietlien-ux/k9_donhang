/**
 * Fallback nhãn + địa chỉ kho.
 *
 * Nghiệp vụ K9 (bảng địa chỉ chính thức 2026-08):
 * - KD 01 · Vĩnh Hội / 275 Hoàng Diệu · code Q4_275 = Q4 Mới
 * - KD 06 · 178 Hoàng Diệu · code Q4_178 = Q4 Cũ
 *
 * Code DB vẫn Q4_178 / Q4_275 — UI luôn hiện Q4 Mới / Q4 Cũ (không hiện code).
 */
export const WAREHOUSE_PRINT_META: Record<
  string,
  { short_name: string; print_name: string; address: string }
> = {
  Q7: {
    short_name: "Q7",
    print_name: "Q7",
    address:
      "269A đường Lê Văn Lương, P. Tân Hưng, TP.HCM, Việt Nam",
  },
  Q8: {
    short_name: "Q8",
    print_name: "Q8",
    address: "86A-88 đường Dương Bá Trạc, P. Chánh Hưng, TP.HCM",
  },
  PH: {
    short_name: "PH",
    print_name: "PH",
    address: "237-239 Phạm Hùng, P.Chánh Hưng, TP.HCM",
  },
  Q5: {
    short_name: "Q5",
    print_name: "Q5",
    address: "7 Trần Hưng Đạo, Phường An Đông, TP.Hồ Chí Minh",
  },
  Q1: {
    short_name: "Q1",
    print_name: "Q1",
    address: "140 đường Nguyễn Văn Cừ, P. Cầu Ông Lãnh, TP.HCM",
  },
  /** 178 Hoàng Diệu = KD 06 = Q4 Cũ */
  Q4_178: {
    short_name: "Q4 Cũ",
    print_name: "Q4 Cũ",
    address: "178 đường Hoàng Diệu, Phường Khánh Hội, TPHCM",
  },
  /** Vĩnh Hội / 275 = KD 01 = Q4 Mới */
  Q4_275: {
    short_name: "Q4 Mới",
    print_name: "Q4 Mới",
    address:
      "L22-24 Cư Xá Vĩnh Hội, đường Hoàng Diệu, phường Khánh Hội, TP Hồ Chí Minh, Việt Nam.",
  },
};

/** Tên đầy đủ GAS → nhãn hiển thị */
export const STORE_DISPLAY_LABELS: Record<string, string> = {
  "Kho Địa điểm kinh doanh Q7": "Q7",
  "Kho Địa điểm kinh doanh 01": "Q4 Mới",
  "Kho Địa điểm kinh doanh 02": "Q8",
  "Kho Địa điểm kinh doanh 03": "PH",
  "Kho Địa điểm kinh doanh 04": "Q5",
  "Kho Địa điểm kinh doanh 05": "Q1",
  "Kho Địa điểm kinh doanh 06": "Q4 Cũ",
};

/** Nhãn UI bắt buộc theo code — ghi đè short_name sai trong DB. */
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
  // Luôn ép short/print/address theo bảng chuẩn
  return {
    ...w,
    short_name: fb.short_name,
    print_name: fb.print_name,
    address: fb.address,
  };
}

/** Nhãn ngắn: Q4 Cũ / Q4 Mới — không bao giờ trả Q4_178 / Q4_275. */
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

  const raw =
    String(w.short_name || "").trim() ||
    String(w.print_name || "").trim() ||
    String(w.code || "").trim() ||
    "—";

  // Code thô còn sót trên UI
  if (raw === "Q4_178") return "Q4 Cũ";
  if (raw === "Q4_275") return "Q4 Mới";
  return raw;
}
