/**
 * Ràng buộc Mã hàng ↔ ĐVT ↔ Mã vạch (chuẩn GAS).
 * - Options ĐVT: mọi dòng products cùng slug + unit/unit_2 + mã con (parent_sku).
 * - Không loại ĐVT vì barcode trống.
 * - Đổi ĐVT → bắt buộc sync barcode (kể cả chuỗi rỗng).
 */

import { normalizeOrderCodeText } from "@/lib/packingWindows";

export interface CatalogProductRow {
  id: string;
  name: string;
  slug: string;
  barcode: string | null;
  unit: string | null;
  barcode_2?: string | null;
  unit_2?: string | null;
  price?: number | null;
  parent_sku?: string | null;
}

export interface SkuUnitOption {
  unit: string;
  /** Có thể rỗng — vẫn giữ option để chọn ĐVT */
  barcode: string;
  productId: string;
  name: string;
  price: number;
  /** Nguồn quy cách: unit chính, unit_2, hoặc mã con */
  source: "unit" | "unit_2" | "child";
}

const LOI_MA = "LỖI MÃ";

function normUnit(u: string | null | undefined): string {
  return String(u || "").trim();
}

/**
 * Thêm option theo ĐVT. Không bỏ vì barcode trống.
 * Nếu ĐVT trùng: ưu tiên bản có barcode (không để barcode đầy bị ghi đè bởi rỗng).
 */
function pushOption(
  out: SkuUnitOption[],
  seen: Set<string>,
  opt: SkuUnitOption,
) {
  const key = opt.unit.toUpperCase();
  if (!key) return;
  if (seen.has(key)) {
    const idx = out.findIndex((o) => o.unit.toUpperCase() === key);
    if (idx < 0) return;
    const cur = out[idx];
    if (!cur.barcode && opt.barcode) {
      out[idx] = opt;
    } else if (
      cur.barcode &&
      opt.barcode &&
      cur.barcode !== opt.barcode &&
      opt.source === "unit"
    ) {
      // Giữ bản hiện có; không nhân đôi ĐVT
    }
    return;
  }
  seen.add(key);
  out.push(opt);
}

/** Mở rộng 1 dòng products → các cặp ĐVT/barcode (unit + unit_2). */
export function expandProductUnitOptions(
  p: CatalogProductRow,
  sourceOverride?: "unit" | "unit_2" | "child",
): SkuUnitOption[] {
  const out: SkuUnitOption[] = [];
  const seen = new Set<string>();
  const u1 = normUnit(p.unit) || "cái";
  pushOption(out, seen, {
    unit: u1,
    barcode: String(p.barcode ?? "").trim(),
    productId: p.id,
    name: p.name,
    price: Number(p.price) || 0,
    source: sourceOverride || "unit",
  });
  const u2 = normUnit(p.unit_2);
  if (u2) {
    pushOption(out, seen, {
      unit: u2,
      // Không fallback sang barcode chính — để ĐVT2 có thể trống MV
      barcode: String(p.barcode_2 ?? "").trim(),
      productId: p.id,
      name: p.name,
      price: Number(p.price) || 0,
      source: sourceOverride === "child" ? "child" : "unit_2",
    });
  }
  return out;
}

/** Index: SKU chuẩn hóa → danh sách quy cách ĐVT (gồm mã con theo parent_sku). */
export function buildSkuUnitIndex(
  products: CatalogProductRow[],
): Map<string, SkuUnitOption[]> {
  const map = new Map<string, SkuUnitOption[]>();

  const ensure = (key: string) => {
    let list = map.get(key);
    if (!list) {
      list = [];
      map.set(key, list);
    }
    return list;
  };

  // 1) Theo slug (mọi dòng trùng mã hàng)
  for (const p of products) {
    if (!p.slug) continue;
    const key = normalizeOrderCodeText(p.slug);
    if (!key) continue;
    const prev = ensure(key);
    const seen = new Set(prev.map((o) => o.unit.toUpperCase()));
    for (const opt of expandProductUnitOptions(p)) {
      pushOption(prev, seen, opt);
    }
  }

  // 2) Mã con (parent_sku = SKU) → thêm ĐVT vào parent (VD: TKS2014 có 3 quy cách)
  for (const p of products) {
    const parent = normalizeOrderCodeText(p.parent_sku || "");
    if (!parent) continue;
    const childSlug = normalizeOrderCodeText(p.slug);
    if (childSlug && childSlug === parent) continue;
    const prev = ensure(parent);
    const seen = new Set(prev.map((o) => o.unit.toUpperCase()));
    for (const opt of expandProductUnitOptions(p, "child")) {
      pushOption(prev, seen, opt);
    }
  }

  return map;
}

export function getSkuUnitOptions(
  index: Map<string, SkuUnitOption[]>,
  sku: string,
): SkuUnitOption[] {
  const key = normalizeOrderCodeText(sku);
  if (!key || key === normalizeOrderCodeText(LOI_MA)) return [];
  return index.get(key) || [];
}

/**
 * Tra cứu mọi quy cách ĐVT/MV của 1 mã hàng từ danh mục đã tải.
 */
export function resolveAvailableVariants(
  products: CatalogProductRow[],
  sku: string,
): SkuUnitOption[] {
  return getSkuUnitOptions(buildSkuUnitIndex(products), sku);
}

export function resolveUnitOption(
  options: SkuUnitOption[],
  unit: string,
): SkuUnitOption | null {
  const u = normUnit(unit);
  if (!u || !options.length) return null;
  const upper = u.toUpperCase();
  const exact = options.find((o) => o.unit.toUpperCase() === upper);
  if (exact) return exact;
  const fold = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/\s+/g, "");
  const folded = fold(u);
  return options.find((o) => fold(o.unit) === folded) || null;
}

/** Barcode tương ứng ĐVT — luôn trả string (rỗng nếu không có). */
export function barcodeForUnit(
  options: SkuUnitOption[],
  unit: string,
): string {
  const match = resolveUnitOption(options, unit);
  if (!match) return "";
  return String(match.barcode ?? "").trim();
}

export function isLoiMaSku(sku: string): boolean {
  return normalizeOrderCodeText(sku) === normalizeOrderCodeText(LOI_MA);
}

export const LOI_MA_SKU = LOI_MA;
