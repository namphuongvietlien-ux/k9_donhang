/**
 * Backfill ĐVT / mã vạch / cờ SP từ catalog khi snapshot order_items trống.
 */
import { supabase } from "@/integrations/supabase/client";
import { normalizeOrderCodeText } from "@/lib/packingWindows";
import {
  expandProductUnitOptions,
  resolveUnitOption,
  type CatalogProductRow,
} from "@/lib/catalogUnitBarcode";

interface ProductCatalogMetaSource {
  slug?: string | null;
  name?: string;
  unit?: string | null;
  barcode?: string | null;
  unit_2?: string | null;
  barcode_2?: string | null;
  is_new?: boolean;
  is_out_stock?: boolean;
  is_locked?: boolean;
  price?: number | null;
  stock_quantity?: number | null;
}

function clampStockQty(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.round(v));
}

export interface ProductCatalogMeta {
  slug: string;
  name: string;
  unit: string | null;
  barcode: string | null;
  unit_2: string | null;
  barcode_2: string | null;
  is_new: boolean;
  is_out_stock: boolean;
  is_locked: boolean;
  price: number;
  /** products.stock_quantity — fallback tồn Q7 khi stock_on_hand thiếu mã */
  stock_quantity: number | null;
}

export type ProductMetaIndex = Map<string, ProductCatalogMeta>;

export function resolveLineUnitBarcode(
  meta: ProductCatalogMeta | undefined,
  unitHint: string | null | undefined,
  barcodeHint?: string | null,
): { unit: string | null; barcode: string | null } {
  if (!meta) {
    return {
      unit: unitHint || null,
      barcode: barcodeHint || null,
    };
  }
  const opts = expandProductUnitOptions(meta as CatalogProductRow);
  const hint = String(unitHint || "").trim();
  const match = hint
    ? resolveUnitOption(opts, hint) || opts[0]
    : opts[0];
  const unit = hint || match?.unit || meta.unit || null;
  let barcode = barcodeHint || match?.barcode || meta.barcode || null;
  if (
    unit &&
    meta.unit_2 &&
    unit.trim().toUpperCase() === meta.unit_2.trim().toUpperCase() &&
    meta.barcode_2
  ) {
    barcode = meta.barcode_2;
  }
  if (!barcode && opts.length) {
    barcode = opts.find((o) => o.barcode)?.barcode || null;
  }
  return { unit, barcode: barcode || null };
}

export function buildProductMetaIndexFromProducts(
  products: ProductCatalogMetaSource[],
  slugs: string[] = [],
): ProductMetaIndex {
  const map: ProductMetaIndex = new Map();
  const requested = new Set(
    slugs
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .map((s) => normalizeOrderCodeText(s))
      .filter(Boolean),
  );

  const rows = (products || []).filter((p) => {
    if (!p.slug) return false;
    if (!requested.size) return true;
    const key = normalizeOrderCodeText(p.slug);
    return !!key && requested.has(key);
  });

  for (const p of rows) {
    if (!p.slug) continue;
    const row: ProductCatalogMeta = {
      slug: p.slug,
      name: p.name || "Sản phẩm",
      unit: p.unit || null,
      barcode: p.barcode || null,
      unit_2: p.unit_2 || null,
      barcode_2: p.barcode_2 || null,
      is_new: !!p.is_new,
      is_out_stock: !!p.is_out_stock,
      is_locked: !!p.is_locked,
      price: Number(p.price) || 0,
      stock_quantity:
        p.stock_quantity == null ? null : clampStockQty(p.stock_quantity),
    };
    map.set(normalizeOrderCodeText(p.slug), row);
    map.set(p.slug.trim().toUpperCase(), row);
  }

  return map;
}

/** Load meta theo danh sách slug (chuẩn hóa key). */
export async function fetchProductMetaBySlugs(
  slugs: string[],
): Promise<ProductMetaIndex> {
  const map: ProductMetaIndex = new Map();
  const unique = [
    ...new Set(
      slugs
        .map((s) => String(s || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!unique.length) return map;

  for (let i = 0; i < unique.length; i += 200) {
    const slice = unique.slice(i, i + 200);
    // Thử cả slug gốc + dạng chuẩn hóa (DB có thể UPPER / lower lẫn)
    const slugVariants = [
      ...new Set(
        slice.flatMap((s) => {
          const n = normalizeOrderCodeText(s);
          return n && n !== s ? [s, n, s.toLowerCase()] : [s, s.toLowerCase()];
        }),
      ),
    ];
    let data: unknown[] | null = null;
    let error: { message?: string } | null = null;

    const full = await supabase
      .from("products")
      .select(
        "slug, name, unit, barcode, unit_2, barcode_2, is_new, is_out_stock, is_locked, price, stock_quantity",
      )
      .in("slug", slugVariants);
    if (
      full.error &&
      /unit_2|barcode_2|is_new|is_locked|stock_quantity/i.test(
        full.error.message || "",
      )
    ) {
      const fb = await supabase
        .from("products")
        .select("slug, name, unit, barcode, price, stock_quantity")
        .in("slug", slugVariants);
      if (fb.error && /stock_quantity/i.test(fb.error.message || "")) {
        const fb2 = await supabase
          .from("products")
          .select("slug, name, unit, barcode, price")
          .in("slug", slugVariants);
        data = fb2.data;
        error = fb2.error;
      } else {
        data = fb.data;
        error = fb.error;
      }
    } else {
      data = full.data;
      error = full.error;
    }
    if (error) continue;

    for (const p of (data as {
      slug: string;
      name: string;
      unit?: string | null;
      barcode?: string | null;
      unit_2?: string | null;
      barcode_2?: string | null;
      is_new?: boolean;
      is_out_stock?: boolean;
      is_locked?: boolean;
      price?: number;
      stock_quantity?: number | null;
    }[] | null) || []) {
      if (!p.slug) continue;
      const row: ProductCatalogMeta = {
        slug: p.slug,
        name: p.name,
        unit: p.unit || null,
        barcode: p.barcode || null,
        unit_2: p.unit_2 || null,
        barcode_2: p.barcode_2 || null,
        is_new: !!p.is_new,
        is_out_stock: !!p.is_out_stock,
        is_locked: !!p.is_locked,
        price: Number(p.price) || 0,
        stock_quantity:
          p.stock_quantity == null ? null : clampStockQty(p.stock_quantity),
      };
      map.set(normalizeOrderCodeText(p.slug), row);
      // Giữ thêm key raw để khớp slug chưa chuẩn hóa
      map.set(p.slug.trim().toUpperCase(), row);
    }
  }

  // Fallback: slug trên phiếu có thể khác casing / ký tự — thử ilike từng batch còn thiếu
  const missing = unique.filter((s) => {
    const k = normalizeOrderCodeText(s);
    return k && !map.has(k) && !map.has(s.trim().toUpperCase());
  });
  for (const slug of missing.slice(0, 80)) {
    const { data } = await supabase
      .from("products")
      .select(
        "slug, name, unit, barcode, unit_2, barcode_2, is_new, is_out_stock, is_locked, price, stock_quantity",
      )
      .ilike("slug", slug)
      .limit(3);
    for (const p of (data as ProductCatalogMeta[] | null) || []) {
      if (!p?.slug) continue;
      const row: ProductCatalogMeta = {
        slug: p.slug,
        name: p.name,
        unit: p.unit || null,
        barcode: p.barcode || null,
        unit_2: (p as { unit_2?: string | null }).unit_2 || null,
        barcode_2: (p as { barcode_2?: string | null }).barcode_2 || null,
        is_new: !!p.is_new,
        is_out_stock: !!p.is_out_stock,
        is_locked: !!p.is_locked,
        price: Number(p.price) || 0,
        stock_quantity:
          (p as { stock_quantity?: number | null }).stock_quantity == null
            ? null
            : clampStockQty(
                (p as { stock_quantity?: number | null }).stock_quantity,
              ),
      };
      map.set(normalizeOrderCodeText(p.slug), row);
      map.set(normalizeOrderCodeText(slug), row);
    }
  }

  return map;
}

export function getMeta(
  index: ProductMetaIndex,
  slug: string | null | undefined,
): ProductCatalogMeta | undefined {
  if (!slug) return undefined;
  return (
    index.get(normalizeOrderCodeText(slug)) ||
    index.get(slug.trim().toUpperCase())
  );
}
