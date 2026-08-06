import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeOrderCodeText } from "@/lib/packingWindows";

export interface StockOnHandRow {
  productId: string;
  productName: string;
  productSlug: string | null;
  barcode: string | null;
  barcode2: string | null;
  quantity: number;
  unit: string | null;
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
  barcode: string | null;
  barcode_2?: string | null;
  stock_quantity?: number | null;
};

type FlatStock = {
  product_id: string;
  quantity: number;
  warehouse_id: string;
};

type NestedStock = {
  product_id: string;
  quantity: number;
  warehouse_id: string;
  products: ProductLite | ProductLite[] | null;
};

function firstProduct(
  p: ProductLite | ProductLite[] | null | undefined,
): ProductLite | null {
  if (!p) return null;
  return Array.isArray(p) ? p[0] || null : p;
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
    const { data, error } = await supabase
      .from("stock_on_hand" as never)
      .select("product_id, quantity, warehouse_id")
      .eq("warehouse_id", warehouseId)
      .order("product_id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    const chunk = (data as FlatStock[] | null) ?? [];
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
          products:product_id (
            id, name, slug, unit, barcode, barcode_2, stock_quantity
          )
        `,
      )
      .eq("warehouse_id", warehouseId)
      .order("product_id", { ascending: true })
      .range(from, to);

    if (
      full.error &&
      /barcode_2|stock_quantity/i.test(full.error.message || "")
    ) {
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
        all.push({
          productId: r.product_id,
          productName: p?.name ?? "Sản phẩm",
          productSlug: p?.slug ?? null,
          barcode: p?.barcode ?? null,
          barcode2: null,
          quantity: clampStockQty(r.quantity),
          unit: p?.unit ?? null,
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
      all.push({
        productId: r.product_id,
        productName: p?.name ?? "Sản phẩm",
        productSlug: p?.slug ?? null,
        barcode: p?.barcode ?? null,
        barcode2: p?.barcode_2 ?? null,
        quantity: clampStockQty(r.quantity),
        unit: p?.unit ?? null,
        warehouseId: r.warehouse_id,
        source: "stock_on_hand",
      });
    }
    if (chunk.length < PAGE) break;
  }
  return all;
}

async function fetchProductsByIds(
  ids: string[],
): Promise<Map<string, ProductLite>> {
  const map = new Map<string, ProductLite>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return map;

  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const slice = unique.slice(i, i + ID_CHUNK);
    const full = await supabase
      .from("products")
      .select("id, name, slug, unit, barcode, barcode_2, stock_quantity")
      .in("id", slice);

    if (
      full.error &&
      /barcode_2|stock_quantity/i.test(full.error.message || "")
    ) {
      const fb = await supabase
        .from("products")
        .select("id, name, slug, unit, barcode")
        .in("id", slice);
      if (fb.error) throw fb.error;
      for (const p of (fb.data as ProductLite[] | null) ?? []) {
        map.set(p.id, p);
      }
      continue;
    }
    if (full.error) throw full.error;
    for (const p of (full.data as ProductLite[] | null) ?? []) {
      map.set(p.id, p);
    }
  }
  return map;
}

async function fetchProductStockFallback(): Promise<StockOnHandRow[]> {
  const all: StockOnHandRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    const full = await supabase
      .from("products")
      .select("id, name, slug, unit, barcode, barcode_2, stock_quantity")
      .eq("is_active", true)
      .not("stock_quantity", "is", null)
      .order("id", { ascending: true })
      .range(from, to);

    if (full.error && /barcode_2/i.test(full.error.message || "")) {
      const fallback = await supabase
        .from("products")
        .select("id, name, slug, unit, barcode, stock_quantity")
        .eq("is_active", true)
        .not("stock_quantity", "is", null)
        .order("id", { ascending: true })
        .range(from, to);
      if (fallback.error) throw fallback.error;
      const chunk = (fallback.data as ProductLite[] | null) ?? [];
      for (const p of chunk) {
        all.push({
          productId: p.id,
          productName: p.name,
          productSlug: p.slug,
          barcode: p.barcode,
          barcode2: null,
          quantity: clampStockQty(p.stock_quantity),
          unit: p.unit,
          warehouseId: "",
          source: "products",
        });
      }
      if (chunk.length < PAGE) break;
      continue;
    }

    if (full.error) throw full.error;
    const chunk = (full.data as ProductLite[] | null) ?? [];
    for (const p of chunk) {
      all.push({
        productId: p.id,
        productName: p.name,
        productSlug: p.slug,
        barcode: p.barcode,
        barcode2: p.barcode_2 || null,
        quantity: clampStockQty(p.stock_quantity),
        unit: p.unit,
        warehouseId: "",
        source: "products",
      });
    }
    if (chunk.length < PAGE) break;
  }
  return all;
}

async function loadStockForWarehouse(
  warehouseId: string,
): Promise<StockOnHandRow[]> {
  let fromSoh: StockOnHandRow[] = [];
  let sohError: Error | null = null;

  try {
    const flat = await fetchAllStockOnHandFlat(warehouseId);
    if (flat.length) {
      const products = await fetchProductsByIds(flat.map((r) => r.product_id));
      fromSoh = flat.map((r) => {
        const p = products.get(r.product_id);
        return {
          productId: r.product_id,
          productName: p?.name ?? "Sản phẩm",
          productSlug: p?.slug ?? null,
          barcode: p?.barcode ?? null,
          barcode2: p?.barcode_2 ?? null,
            quantity: clampStockQty(r.quantity),
            unit: p?.unit ?? null,
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
    fromProducts = await fetchProductStockFallback();
  } catch {
    // Không làm mất dữ liệu SOH nếu fallback lỗi
    fromProducts = [];
  }

  if (!fromSoh.length && !fromProducts.length) {
    if (sohError) throw sohError;
    return [];
  }
  if (!fromSoh.length) return fromProducts;
  if (!fromProducts.length) return fromSoh;

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

function indexStock(rows: StockOnHandRow[]): Map<string, StockOnHandRow> {
  const map = new Map<string, StockOnHandRow>();
  const put = (key: string | null | undefined, row: StockOnHandRow) => {
    const k = normalizeOrderCodeText(key || "");
    if (!k) return;
    const prev = map.get(k);
    if (prev && prev.source === "stock_on_hand" && row.source === "products") {
      return;
    }
    map.set(k, row);
  };

  for (const r of rows) {
    put(r.productId, r);
    put(r.productSlug, r);
    put(r.barcode, r);
    put(r.barcode2, r);
  }
  return map;
}

/**
 * Port of GAS getStockMapForStore — tải đủ tồn Q7 để soạn hàng.
 */
export function useStock(warehouseId?: string | null, enabled = true) {
  const query = useQuery({
    queryKey: ["stock-on-hand", warehouseId],
    enabled: enabled && !!warehouseId,
    staleTime: 30_000,
    retry: 1,
    queryFn: () => loadStockForWarehouse(warehouseId!),
  });

  const byKey = useMemo(
    () => indexStock(query.data ?? []),
    [query.data],
  );

  const getQty = useCallback(
    (slugOrIdOrBarcodeOrName: string | null | undefined): number | null => {
      if (!slugOrIdOrBarcodeOrName) return null;
      const hit = byKey.get(normalizeOrderCodeText(slugOrIdOrBarcodeOrName));
      return hit ? hit.quantity : null;
    },
    [byKey],
  );

  const getRow = useCallback(
    (
      slugOrIdOrBarcodeOrName: string | null | undefined,
    ): StockOnHandRow | null => {
      if (!slugOrIdOrBarcodeOrName) return null;
      return byKey.get(normalizeOrderCodeText(slugOrIdOrBarcodeOrName)) ?? null;
    },
    [byKey],
  );

  const sohCount = useMemo(
    () => (query.data ?? []).filter((r) => r.source === "stock_on_hand").length,
    [query.data],
  );

  return {
    rows: query.data ?? [],
    bySlug: byKey,
    getQty,
    getRow,
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
