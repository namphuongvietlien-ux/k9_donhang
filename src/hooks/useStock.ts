import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/hooks/useProducts";
import { normalizeOrderCodeText } from "@/lib/packingWindows";
import {
  normalizeStockCompositeKey,
  normalizeUnitKey,
  stockCompositeKey,
  stockUnitSuffix,
} from "@/lib/stockKeys";

export interface StockOnHandRow {
  productId: string;
  productName: string;
  productSlug: string | null;
  barcode: string | null;
  barcode2: string | null;
  quantity: number;
  /** ĐVT của dòng tồn (từ stock_on_hand.unit) */
  unit: string | null;
  unitKey: string;
  productUnit: string | null;
  productUnit2: string | null;
  warehouseId: string;
  source: "stock_on_hand" | "products";
}

const PAGE = 1000;
const ID_CHUNK = 200;

/** Tồn Q7 không âm — hiển thị & map luôn >= 0 */
export function clampStockQty(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.round(v));
}

type ProductLite = {
  id: string;
  name: string;
  slug: string | null;
  unit: string | null;
  unit_2?: string | null;
  barcode: string | null;
  barcode_2?: string | null;
  stock_quantity?: number | null;
  is_active?: boolean;
};

type FlatStock = {
  product_id: string;
  quantity: number;
  warehouse_id: string;
  unit?: string | null;
  unit_key?: string | null;
};

type NestedStock = {
  product_id: string;
  quantity: number;
  warehouse_id: string;
  unit?: string | null;
  unit_key?: string | null;
  products: ProductLite | ProductLite[] | null;
};

function firstProduct(
  p: ProductLite | ProductLite[] | null | undefined,
): ProductLite | null {
  if (!p) return null;
  return Array.isArray(p) ? p[0] || null : p;
}

function resolveUnitFields(
  sohUnit: string | null | undefined,
  sohUnitKey: string | null | undefined,
  productUnit: string | null | undefined,
): { unit: string; unitKey: string } {
  const unit = String(sohUnit || productUnit || "cái").trim() || "cái";
  const unitKey =
    normalizeUnitKey(sohUnitKey) || normalizeUnitKey(unit) || "cai";
  return { unit, unitKey };
}

/**
 * Flat select + order + range — tránh join lồng cắt ~1000 dòng.
 */
async function fetchAllStockOnHandFlat(
  warehouseId: string,
): Promise<FlatStock[]> {
  const all: FlatStock[] = [];
  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    const withUnit = await supabase
      .from("stock_on_hand" as never)
      .select("product_id, quantity, warehouse_id, unit, unit_key")
      .eq("warehouse_id", warehouseId)
      .order("product_id", { ascending: true })
      .range(from, to);

    if (withUnit.error && /unit_key|column.*unit/i.test(withUnit.error.message || "")) {
      const legacy = await supabase
        .from("stock_on_hand" as never)
        .select("product_id, quantity, warehouse_id")
        .eq("warehouse_id", warehouseId)
        .order("product_id", { ascending: true })
        .range(from, to);
      if (legacy.error) throw legacy.error;
      const chunk = (legacy.data as FlatStock[] | null) ?? [];
      all.push(...chunk);
      if (chunk.length < PAGE) break;
      continue;
    }

    if (withUnit.error) throw withUnit.error;
    const chunk = (withUnit.data as FlatStock[] | null) ?? [];
    all.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return all;
}

/** Fallback kiểu cũ (join products) — vẫn phân trang + order. */
async function fetchAllStockOnHandNested(
  warehouseId: string,
): Promise<StockOnHandRow[]> {
  const all: StockOnHandRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    const full = await supabase
      .from("stock_on_hand" as never)
      .select(
        `
          product_id,
          quantity,
          warehouse_id,
          unit,
          unit_key,
          products:product_id (
            id, name, slug, unit, unit_2, barcode, barcode_2, stock_quantity
          )
        `,
      )
      .eq("warehouse_id", warehouseId)
      .order("product_id", { ascending: true })
      .range(from, to);

    const errMsg = full.error?.message || "";
    if (full.error && /unit_key|barcode_2|unit_2|stock_quantity/i.test(errMsg)) {
      const fallback = await supabase
        .from("stock_on_hand" as never)
        .select(
          `
            product_id,
            quantity,
            warehouse_id,
            products:product_id ( id, name, slug, unit, barcode )
          `,
        )
        .eq("warehouse_id", warehouseId)
        .order("product_id", { ascending: true })
        .range(from, to);
      if (fallback.error) throw fallback.error;
      const chunk = (fallback.data as NestedStock[] | null) ?? [];
      for (const r of chunk) {
        const p = firstProduct(r.products);
        const u = resolveUnitFields(r.unit, r.unit_key, p?.unit);
        all.push({
          productId: r.product_id,
          productName: p?.name ?? "Sản phẩm",
          productSlug: p?.slug ?? null,
          barcode: p?.barcode ?? null,
          barcode2: null,
          quantity: clampStockQty(r.quantity),
          unit: u.unit,
          unitKey: u.unitKey,
          productUnit: p?.unit ?? null,
          productUnit2: null,
          warehouseId: r.warehouse_id,
          source: "stock_on_hand",
        });
      }
      if (chunk.length < PAGE) break;
      continue;
    }

    if (full.error) throw full.error;
    const chunk = (full.data as NestedStock[] | null) ?? [];
    for (const r of chunk) {
      const p = firstProduct(r.products);
      const u = resolveUnitFields(r.unit, r.unit_key, p?.unit);
      all.push({
        productId: r.product_id,
        productName: p?.name ?? "Sản phẩm",
        productSlug: p?.slug ?? null,
        barcode: p?.barcode ?? null,
        barcode2: p?.barcode_2 ?? null,
        quantity: clampStockQty(r.quantity),
        unit: u.unit,
        unitKey: u.unitKey,
        productUnit: p?.unit ?? null,
        productUnit2: p?.unit_2 ?? null,
        warehouseId: r.warehouse_id,
        source: "stock_on_hand",
      });
    }
    if (chunk.length < PAGE) break;
  }
  return all;
}

function fetchProductStockFallback(products: ProductLite[]): StockOnHandRow[] {
  return products
    .filter((p) => p.is_active !== false && p.stock_quantity != null)
    .map((p) => {
      const u = resolveUnitFields(p.unit, null, p.unit);
      return {
        productId: p.id,
        productName: p.name,
        productSlug: p.slug,
        barcode: p.barcode,
        barcode2: p.barcode_2 || null,
        quantity: clampStockQty(p.stock_quantity),
        unit: u.unit,
        unitKey: u.unitKey,
        productUnit: p.unit,
        productUnit2: p.unit_2 || null,
        warehouseId: "",
        source: "products" as const,
      };
    });
}

async function loadStockForWarehouse(
  warehouseId: string,
  products: ProductLite[],
): Promise<StockOnHandRow[]> {
  let fromSoh: StockOnHandRow[] = [];
  let sohError: Error | null = null;

  try {
    const flat = await fetchAllStockOnHandFlat(warehouseId);
    if (flat.length) {
      const productIndex = new Map(products.map((p) => [p.id, p]));
      fromSoh = flat.map((r) => {
        const p = productIndex.get(r.product_id);
        const u = resolveUnitFields(r.unit, r.unit_key, p?.unit);
        return {
          productId: r.product_id,
          productName: p?.name ?? "Sản phẩm",
          productSlug: p?.slug ?? null,
          barcode: p?.barcode ?? null,
          barcode2: p?.barcode_2 ?? null,
          quantity: clampStockQty(r.quantity),
          unit: u.unit,
          unitKey: u.unitKey,
          productUnit: p?.unit ?? null,
          productUnit2: p?.unit_2 ?? null,
          warehouseId: r.warehouse_id,
          source: "stock_on_hand" as const,
        };
      });
    }
  } catch (e) {
    sohError = e instanceof Error ? e : new Error(String(e));
    try {
      fromSoh = await fetchAllStockOnHandNested(warehouseId);
      sohError = null;
    } catch (e2) {
      sohError = e2 instanceof Error ? e2 : new Error(String(e2));
    }
  }

  let fromProducts: StockOnHandRow[] = [];
  try {
    fromProducts = fetchProductStockFallback(products);
  } catch {
    fromProducts = [];
  }

  if (!fromSoh.length && !fromProducts.length) {
    if (sohError) throw sohError;
    return [];
  }
  if (!fromSoh.length) return fromProducts;
  if (!fromProducts.length) return fromSoh;

  // Filler chỉ khi chưa có bất kỳ dòng SOH nào cho product (mọi ĐVT)
  const sohIds = new Set(fromSoh.map((r) => r.productId));
  const sohSlugs = new Set(
    fromSoh
      .map((r) => normalizeOrderCodeText(r.productSlug || ""))
      .filter(Boolean),
  );
  const fillers = fromProducts.filter((r) => {
    if (sohIds.has(r.productId)) return false;
    const slug = normalizeOrderCodeText(r.productSlug || "");
    if (slug && sohSlugs.has(slug)) return false;
    return true;
  });
  return [...fromSoh, ...fillers];
}

type StockIndex = {
  /** CODE|DV:unit → row */
  byComposite: Map<string, StockOnHandRow>;
  /** CODE bare → rows (mọi ĐVT) */
  byBare: Map<string, StockOnHandRow[]>;
};

function indexStock(rows: StockOnHandRow[]): StockIndex {
  const byComposite = new Map<string, StockOnHandRow>();
  const byBare = new Map<string, StockOnHandRow[]>();

  const putComposite = (key: string | null | undefined, row: StockOnHandRow) => {
    // Không dùng normalizeOrderCodeText cho cả chuỗi: nó upper luôn phần
    // `|DV:hop` → lệch với key tra cứu (xem normalizeStockCompositeKey).
    const k = normalizeStockCompositeKey(key);
    if (!k) return;
    const prev = byComposite.get(k);
    if (prev && prev.source === "stock_on_hand" && row.source === "products") {
      return;
    }
    byComposite.set(k, row);
  };

  const pushBare = (code: string | null | undefined, row: StockOnHandRow) => {
    const k = normalizeOrderCodeText(code || "");
    if (!k) return;
    const list = byBare.get(k) || [];
    // Tránh trùng cùng product+unit
    if (
      !list.some(
        (r) =>
          r.productId === row.productId &&
          r.unitKey === row.unitKey &&
          r.source === row.source,
      )
    ) {
      list.push(row);
      byBare.set(k, list);
    }
  };

  for (const r of rows) {
    const suffix = stockUnitSuffix(r.unitKey || r.unit);
    const codes = [
      r.productId,
      r.productSlug,
      // Barcode khớp ĐVT: unit chính → barcode, unit_2 → barcode_2
      normalizeUnitKey(r.unit) === normalizeUnitKey(r.productUnit2)
        ? r.barcode2
        : r.barcode,
      r.barcode,
      r.barcode2,
    ];

    for (const code of codes) {
      if (!code) continue;
      putComposite(stockCompositeKey(code, r.unit), r);
      if (suffix) {
        // Alias với unitKey đã chuẩn
        putComposite(normalizeOrderCodeText(code) + suffix, r);
      }
      pushBare(code, r);
    }

    // Bare alias: ưu tiên ĐVT chính của SP; nếu không có thì vẫn ghi nếu chưa có
    const primaryKey = normalizeUnitKey(r.productUnit) || r.unitKey;
    if (r.unitKey === primaryKey || !primaryKey) {
      putComposite(r.productSlug, r);
      putComposite(r.barcode, r);
      putComposite(r.productId, r);
    }
  }

  return { byComposite, byBare };
}

/**
 * Tra cứu tồn theo mã + ĐVT (GAS lookupStockByPrefixCode_).
 * Có ĐVT → ưu tiên khớp ĐVT; miss → fallback bare / cộng biến thể.
 */
function lookupQty(
  index: StockIndex,
  code: string | null | undefined,
  unit?: string | null,
): number | null {
  if (!code) return null;
  const bare = normalizeOrderCodeText(code);
  if (!bare) return null;
  const unitKey = normalizeUnitKey(unit);

  if (unitKey) {
    const hit = index.byComposite.get(bare + stockUnitSuffix(unitKey));
    if (hit) return hit.quantity;

    // Khớp ĐÚNG ĐVT trong byBare phải xét TRƯỚC alias bare: alias bare luôn trỏ
    // về ĐVT cơ sở, nên hỏi "Thùng" mà trả tồn "Cái" là sai (còn 5 Thùng nhưng
    // Cái = 0 sẽ bị báo hết hàng).
    const list = index.byBare.get(bare);
    const exact = list?.find((r) => r.unitKey === unitKey);
    if (exact) return exact.quantity;

    // Fallback bare (1 dòng không gắn ĐVT hoặc alias primary)
    const bareHit = index.byComposite.get(bare);
    if (bareHit) return bareHit.quantity;
    // Cộng mọi biến thể cùng mã nếu chỉ có rows trong byBare
    if (list?.length) {
      return list.reduce((s, r) => s + r.quantity, 0);
    }
    return null;
  }

  // Không có ĐVT: ưu tiên alias bare; không thì cộng mọi ĐVT
  const bareHit = index.byComposite.get(bare);
  if (bareHit) return bareHit.quantity;
  const list = index.byBare.get(bare);
  if (!list?.length) return null;
  if (list.length === 1) return list[0].quantity;
  return list.reduce((s, r) => s + r.quantity, 0);
}

function lookupRow(
  index: StockIndex,
  code: string | null | undefined,
  unit?: string | null,
): StockOnHandRow | null {
  if (!code) return null;
  const bare = normalizeOrderCodeText(code);
  if (!bare) return null;
  const unitKey = normalizeUnitKey(unit);

  if (unitKey) {
    const hit = index.byComposite.get(bare + stockUnitSuffix(unitKey));
    if (hit) return hit;
    // Cùng lý do như lookupQty: ĐVT khớp đúng phải thắng alias bare.
    const exact = index.byBare.get(bare)?.find((r) => r.unitKey === unitKey);
    if (exact) return exact;
  }
  const bareHit = index.byComposite.get(bare);
  if (bareHit) return bareHit;
  const list = index.byBare.get(bare);
  if (!list?.length) return null;
  return list[0];
}

/**
 * Port of GAS getStockMapForStore — tải đủ tồn Q7 để soạn hàng.
 * Key = mã hàng + ĐVT.
 */
export function useStock(warehouseId?: string | null, enabled = true) {
  const { products } = useProducts();
  const productsKey = useMemo(
    () =>
      products
        .map((p) => `${p.id}:${p.slug || ""}:${p.stock_quantity ?? ""}`)
        .join("|"),
    [products],
  );

  const query = useQuery({
    queryKey: ["stock-on-hand", warehouseId, productsKey],
    enabled: enabled && !!warehouseId,
    staleTime: 30_000,
    retry: 1,
    queryFn: () => loadStockForWarehouse(warehouseId!, products as any),
  });

  const index = useMemo(() => indexStock(query.data ?? []), [query.data]);

  const getQty = useCallback(
    (
      slugOrIdOrBarcodeOrName: string | null | undefined,
      unit?: string | null,
    ): number | null => lookupQty(index, slugOrIdOrBarcodeOrName, unit),
    [index],
  );

  const getRow = useCallback(
    (
      slugOrIdOrBarcodeOrName: string | null | undefined,
      unit?: string | null,
    ): StockOnHandRow | null =>
      lookupRow(index, slugOrIdOrBarcodeOrName, unit),
    [index],
  );

  /**
   * Dùng khi quyết định có được xuất/in: chỉ chấp nhận tồn stock_on_hand
   * khớp đúng mã và ĐVT, không fallback products.stock_quantity hay mã trần.
   */
  const getVerifiedQty = useCallback(
    (
      slugOrIdOrBarcode: string | null | undefined,
      unit?: string | null,
    ): number | null => {
      if (!slugOrIdOrBarcode) return null;
      const key = stockCompositeKey(slugOrIdOrBarcode, unit);
      const exact = index.byComposite.get(key);
      if (exact?.source === "stock_on_hand") return exact.quantity;

      const bare = normalizeOrderCodeText(slugOrIdOrBarcode);
      const rows = (index.byBare.get(bare) || []).filter(
        (row) => row.source === "stock_on_hand",
      );
      if (!rows.length) return null;

      const unitKey = normalizeUnitKey(unit);
      const sameUnit = unitKey
        ? rows.find((row) => row.unitKey === unitKey)
        : null;
      if (sameUnit) return sameUnit.quantity;

      // Chỉ một dòng tồn của mã: khác nhãn ĐVT nhưng không có quy cách khác
      // để nhầm lẫn, nên vẫn là tồn Q7 được xác thực.
      return rows.length === 1 ? rows[0].quantity : null;
    },
    [index],
  );

  const sohCount = useMemo(
    () => (query.data ?? []).filter((r) => r.source === "stock_on_hand").length,
    [query.data],
  );

  return {
    rows: query.data ?? [],
    bySlug: index.byComposite,
    getQty,
    getRow,
    getVerifiedQty,
    loading: query.isLoading || query.isFetching,
    error: query.error,
    refetch: query.refetch,
    count: query.data?.length ?? 0,
    sohCount,
  };
}

/** Resolve Q7 warehouse id for packing source stock */
export function usePackingSourceWarehouse() {
  return useQuery({
    queryKey: ["warehouse-q7"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses" as never)
        .select("id, code, name")
        .eq("code", "Q7")
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; code: string; name: string } | null;
    },
  });
}
