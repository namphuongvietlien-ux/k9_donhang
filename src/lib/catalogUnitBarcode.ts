/**
 * Ràng buộc Mã hàng ↔ ĐVT ↔ Mã vạch (chuẩn GAS).
 * - Options ĐVT lấy từ mọi quy cách cùng SKU (products.slug + unit / unit_2).
 * - Đổi ĐVT → sync barcode (và productId nếu có nhiều dòng).
 * - SKU không có trong catalog → unitOptions rỗng → UI Input tự do (Lỗi Mã).
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
}

export interface SkuUnitOption {
  unit: string;
  barcode: string;
  productId: string;
  name: string;
  price: number;
  /** Nguồn quy cách: unit chính hay unit_2 */
  source: "unit" | "unit_2";
}

const LOI_MA = "LỖI MÃ";

function normUnit(u: string | null | undefined): string {
  return String(u || "").trim();
}

function pushOption(
  out: SkuUnitOption[],
  seen: Set<string>,
  opt: SkuUnitOption,
) {
  const key = opt.unit.toUpperCase();
  if (!key || seen.has(key)) return;
  seen.add(key);
  out.push(opt);
}

/** Mở rộng 1 dòng products → các cặp ĐVT/barcode (unit + unit_2). */
export function expandProductUnitOptions(
  p: CatalogProductRow,
): SkuUnitOption[] {
  const out: SkuUnitOption[] = [];
  const seen = new Set<string>();
  const u1 = normUnit(p.unit) || "cái";
  pushOption(out, seen, {
    unit: u1,
    barcode: String(p.barcode || "").trim(),
    productId: p.id,
    name: p.name,
    price: Number(p.price) || 0,
    source: "unit",
  });
  const u2 = normUnit(p.unit_2);
  if (u2) {
    pushOption(out, seen, {
      unit: u2,
      barcode: String(p.barcode_2 || p.barcode || "").trim(),
      productId: p.id,
      name: p.name,
      price: Number(p.price) || 0,
      source: "unit_2",
    });
  }
  return out;
}

/** Index: SKU chuẩn hóa → danh sách quy cách ĐVT. */
export function buildSkuUnitIndex(
  products: CatalogProductRow[],
): Map<string, SkuUnitOption[]> {
  const map = new Map<string, SkuUnitOption[]>();
  for (const p of products) {
    if (!p.slug) continue;
    const key = normalizeOrderCodeText(p.slug);
    if (!key) continue;
    const prev = map.get(key) || [];
    const seen = new Set(prev.map((o) => o.unit.toUpperCase()));
    for (const opt of expandProductUnitOptions(p)) {
      pushOption(prev, seen, opt);
    }
    map.set(key, prev);
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
 * Tra cứu mọi quy cách ĐVT/MV của 1 mã hàng từ danh mục đã tải
 * (gộp mọi dòng products cùng slug + unit/unit_2).
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
  // Khớp không dấu / khoảng trắng (Cái ≈ cái)
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

export function isLoiMaSku(sku: string): boolean {
  return normalizeOrderCodeText(sku) === normalizeOrderCodeText(LOI_MA);
}

export const LOI_MA_SKU = LOI_MA;
