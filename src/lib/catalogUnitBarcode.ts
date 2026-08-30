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
  /** Giá bán theo unit_2 (KiotViet dòng quy đổi) — không suy ra từ price × tỷ lệ */
  price_2?: number | null;
  /** 1 unit_2 = unit_2_ratio × unit */
  unit_2_ratio?: number | null;
  parent_sku?: string | null;
}

export interface SkuUnitOption {
  unit: string;
  /** Có thể rỗng — vẫn giữ option để chọn ĐVT */
  barcode: string;
  productId: string;
  name: string;
  /** Giá bán của CHÍNH ĐVT này (ĐVT lớn có giá riêng, không phải giá cơ sở × tỷ lệ) */
  price: number;
  /** 1 ĐVT này = ratio ĐVT cơ sở (ĐVT cơ sở = 1) */
  ratio: number;
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
  const basePrice = Number(p.price) || 0;
  const u1 = normUnit(p.unit) || "cái";
  pushOption(out, seen, {
    unit: u1,
    barcode: String(p.barcode ?? "").trim(),
    productId: p.id,
    name: p.name,
    price: basePrice,
    ratio: 1,
    source: sourceOverride || "unit",
  });
  const u2 = normUnit(p.unit_2);
  if (u2) {
    const ratio = Number(p.unit_2_ratio) > 0 ? Number(p.unit_2_ratio) : 1;
    // Ưu tiên giá thật của ĐVT lớn; chỉ khi thiếu mới suy ra bằng giá cơ sở × tỷ lệ.
    const unit2Price = Number(p.price_2) > 0 ? Number(p.price_2) : basePrice * ratio;
    pushOption(out, seen, {
      unit: u2,
      // Không fallback sang barcode chính — để ĐVT2 có thể trống MV
      barcode: String(p.barcode_2 ?? "").trim(),
      productId: p.id,
      name: p.name,
      price: unit2Price,
      ratio,
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

function foldUnitKey(u: string | null | undefined): string {
  return String(u || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, "");
}

/**
 * MOQ = unit_2_ratio khi đặt / soạn theo ĐVT cơ sở.
 * ĐVT lớn (unit_2) đã là 1 kiện → MOQ = 1.
 */
export function resolveLineMoq(
  product: {
    unit?: string | null;
    unit_2?: string | null;
    unit_2_ratio?: number | null;
  } | null | undefined,
  lineUnit: string | null | undefined,
): number {
  const ratio = Number(product?.unit_2_ratio);
  if (!Number.isFinite(ratio) || ratio <= 1) return 1;
  const u = foldUnitKey(lineUnit);
  const large = foldUnitKey(product?.unit_2);
  if (large && u && u === large) return 1;
  return ratio;
}

/**
 * MOQ từ quy cách ĐVT đã index (ratio của unit_2).
 * @param fallbackRatio unit_2_ratio từ catalog khi options chưa mang ratio
 */
export function resolveLineMoqFromOptions(
  options: SkuUnitOption[],
  lineUnit: string | null | undefined,
  fallbackRatio?: number | null,
): number {
  const fallback =
    Number(fallbackRatio) > 1 ? Number(fallbackRatio) : 1;
  if (!options.length) return fallback;
  const maxRatio = Math.max(
    ...options.map((o) => Number(o.ratio) || 1),
    fallback,
    1,
  );
  if (maxRatio <= 1) return 1;
  const selected = resolveUnitOption(options, String(lineUnit || ""));
  if (selected && selected.ratio > 1) return 1;
  return maxRatio;
}

/** SL > 0 phải là bội số MOQ. SL = 0 được phép (bỏ dòng / chưa soạn). */
export function isQtyMultipleOfMoq(qty: number, moq: number): boolean {
  if (!(moq > 1)) return true;
  if (!Number.isFinite(qty) || qty < 0) return false;
  if (qty === 0) return true;
  const q = Math.round(qty * 1000);
  const m = Math.round(moq * 1000);
  return m > 0 && q % m === 0;
}

/** Làm tròn lên bội số MOQ gần nhất (vd 15, MOQ 10 → 20). */
export function nearestMoqCeiling(qty: number, moq: number): number {
  if (!(moq > 1) || !Number.isFinite(qty) || qty <= 0) {
    return Math.max(0, Number(qty) || 0);
  }
  return Math.ceil(qty / moq) * moq;
}

export function isLoiMaSku(sku: string): boolean {
  return normalizeOrderCodeText(sku) === normalizeOrderCodeText(LOI_MA);
}

export const LOI_MA_SKU = LOI_MA;
