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

function foldStoreKey(value?: string | null): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Tên dòng con trên file MISA TỔNG HỢP TỒN KHO (không phải tên SP). */
export function isMisaWarehouseRowName(name?: string | null): boolean {
  const n = foldStoreKey(name);
  if (!n) return false;
  if (n.startsWith("khodiadiem") || n.startsWith("diadiemkinhdoanh")) return true;
  if (n.startsWith("khoq") && n.length <= 8) return true;
  return n in STORE_DISPLAY_LABELS || n.startsWith("tongcongty");
}

/**
 * Map cột "Cửa hàng" / "Kho Địa điểm kinh doanh …" → warehouses.code.
 * "Tổng công ty" và chuỗi không nhận ra → null (bỏ, không ghi tồn).
 */
export function resolveMisaStoreCode(raw?: string | null): string | null {
  const n = foldStoreKey(raw);
  if (!n || n.includes("tongcong")) return null;

  if (n.includes("q4m") || n.includes("q4moi") || n.includes("vinhhoi")) return "Q4_275";
  if (n.includes("q4c") || n.includes("q4cu")) return "Q4_178";
  if (n.includes("dbt") || n.includes("duongbatrac")) return "Q8";
  if (n.includes("phamhung") || n.includes("kinhdoanh03") || n.endsWith("ph")) {
    return "PH";
  }
  if (n.includes("kinhdoanhq7") || n.includes("levanluong") || n.endsWith("q7")) {
    return "Q7";
  }
  if (n.includes("kinhdoanh01")) return "Q4_275";
  if (n.includes("kinhdoanh02")) return "Q8";
  if (n.includes("kinhdoanh04") || n.includes("q5")) return "Q5";
  if (n.includes("kinhdoanh05") || n.includes("q1")) return "Q1";
  if (n.includes("kinhdoanh06")) return "Q4_178";
  if (n.includes("q8")) return "Q8";
  if (n.includes("q7")) return "Q7";
  return null;
}
