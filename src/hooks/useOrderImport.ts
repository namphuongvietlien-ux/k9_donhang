import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildOrderInsertPayload,
  parseOrderImportMatrix,
  type BuildOrderInsertInput,
  type ParsedImportFile,
  type PhieuLoai,
  type ProductRef,
} from "@/lib/importOrders";
import {
  buildOrderSkuSignature,
  DUP_PRESAVE_MINUTES,
  normalizeOrderCodeText,
  toHoChiMinhMillis,
} from "@/lib/packingWindows";
import { isExcludedFromDuplicateCheck } from "@/lib/softLineValidation";

export interface DuplicatePreSaveResult {
  isDuplicate: boolean;
  peerOrderCode: string | null;
  peerId: string | null;
  reason: string | null;
  /** Số phút cách đây (làm tròn) — cho dialog PRD */
  minutesAgo: number | null;
}

async function loadCatalog(): Promise<ProductRef[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, slug, price, unit, barcode")
    .limit(5000);
  if (error) throw error;
  return (data as ProductRef[]) || [];
}

async function loadQ7StockMap(): Promise<{
  warehouseId: string | null;
  bySlug: Map<string, number>;
}> {
  const { data: wh } = await supabase
    .from("warehouses" as never)
    .select("id, code")
    .eq("code", "Q7")
    .maybeSingle();

  const warehouseId = (wh as { id: string } | null)?.id ?? null;
  const bySlug = new Map<string, number>();
  if (!warehouseId) return { warehouseId, bySlug };

  let stock: unknown[] | null = null;
  {
    const full = await supabase
      .from("stock_on_hand" as never)
      .select("quantity, unit, unit_key, products:product_id ( slug, name )")
      .eq("warehouse_id", warehouseId);
    if (full.error && /unit_key|column.*unit/i.test(full.error.message || "")) {
      const fb = await supabase
        .from("stock_on_hand" as never)
        .select("quantity, products:product_id ( slug, name )")
        .eq("warehouse_id", warehouseId);
      if (fb.error) throw fb.error;
      stock = fb.data as unknown[] | null;
    } else if (full.error) {
      throw full.error;
    } else {
      stock = full.data as unknown[] | null;
    }
  }

  type Row = {
    quantity: number;
    unit?: string | null;
    unit_key?: string | null;
    products: { slug: string | null; name: string } | null;
  };
  for (const r of (stock as Row[] | null) ?? []) {
    const slug = normalizeOrderCodeText(
      r.products?.slug || r.products?.name || "",
    );
    if (!slug) continue;
    // Cộng dồn nếu nhiều ĐVT (preview import không tách ĐVT)
    bySlug.set(slug, (bySlug.get(slug) || 0) + (Number(r.quantity) || 0));
  }
  return { warehouseId, bySlug };
}

/**
 * PRD Phần 3 — check trùng ≤5 phút trước khi insert.
 * Cùng kho nhận + (cùng totalQty HOẶC cùng skuSignature).
 * Loại trừ: Đã soạn (processing), Hủy, Hủy (Trùng).
 * Soft: không chặn cứng — caller hiện dialog.
 */
export async function checkDuplicateBeforeSave(
  warehouseId: string,
  totalQty: number,
  skuSignature: string,
): Promise<DuplicatePreSaveResult> {
  const empty: DuplicatePreSaveResult = {
    isDuplicate: false,
    peerOrderCode: null,
    peerId: null,
    reason: null,
    minutesAgo: null,
  };

  if (!warehouseId) return empty;

  const since = new Date(
    Date.now() - DUP_PRESAVE_MINUTES * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id, order_code, created_at, warehouse_id, status, notes,
      order_items ( product_slug, product_name, quantity )
    `,
    )
    .eq("warehouse_id" as never, warehouseId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error || !data) return empty;

  type Raw = {
    id: string;
    order_code: string | null;
    created_at: string;
    status: string | null;
    notes: string | null;
    order_items: {
      product_slug: string | null;
      product_name: string;
      quantity: number;
    }[] | null;
  };

  for (const order of data as unknown as Raw[]) {
    if (isExcludedFromDuplicateCheck(order.status, order.notes)) continue;

    const skuQty: Record<string, number> = {};
    let qty = 0;
    for (const it of order.order_items || []) {
      qty += Number(it.quantity) || 0;
      const k = normalizeOrderCodeText(it.product_slug || it.product_name);
      if (k) skuQty[k] = (skuQty[k] || 0) + (Number(it.quantity) || 0);
    }
    const sig = buildOrderSkuSignature(skuQty);
    const sameQty = totalQty > 0 && totalQty === qty;
    const sameSku = !!(skuSignature && sig && skuSignature === sig);
    if (!sameQty && !sameSku) continue;

    const deltaMin =
      Math.abs(Date.now() - toHoChiMinhMillis(order.created_at)) / 60000;
    if (deltaMin > DUP_PRESAVE_MINUTES) continue;

    const minutesAgo = Math.max(1, Math.round(deltaMin));
    let reason: string;
    if (sameSku && sameQty) {
      reason = "Cùng danh mục & Cùng tổng SL";
    } else if (sameSku) {
      reason = "Cùng danh mục";
    } else {
      reason = "Cùng tổng SL";
    }

    return {
      isDuplicate: true,
      peerOrderCode: order.order_code,
      peerId: order.id,
      reason,
      minutesAgo,
    };
  }

  return empty;
}

export function useImportCatalogAndStock() {
  return useQuery({
    queryKey: ["import-catalog-stock"],
    queryFn: async () => {
      const [catalog, stock] = await Promise.all([
        loadCatalog(),
        loadQ7StockMap(),
      ]);
      return { catalog, ...stock };
    },
    staleTime: 60_000,
  });
}

export function useParseImportFile() {
  const { data: base } = useImportCatalogAndStock();

  return {
    ready: !!base,
    parse: (matrix: unknown[][]): ParsedImportFile => {
      if (!base) throw new Error("Đang tải danh mục / tồn kho…");
      return parseOrderImportMatrix(matrix, base.catalog, base.bySlug);
    },
    q7WarehouseId: base?.warehouseId ?? null,
  };
}

export function useCommitOrderImport() {
  return useMutation({
    mutationFn: async (input: {
      loaiPhieu: PhieuLoai;
      warehouseId: string;
      sourceWarehouseId: string | null;
      lines: BuildOrderInsertInput["lines"];
      acknowledgeDuplicate: boolean;
      totalQty: number;
      skuSignature: string;
    }) => {
      const dup = await checkDuplicateBeforeSave(
        input.warehouseId,
        input.totalQty,
        input.skuSignature,
      );
      if (dup.isDuplicate && !input.acknowledgeDuplicate) {
        const err = new Error(
          `DUP:${dup.peerOrderCode || dup.peerId}:${dup.reason || ""}`,
        );
        (err as Error & { duplicate: DuplicatePreSaveResult }).duplicate = dup;
        throw err;
      }

      const { orderRow, itemRows, orderCode } = buildOrderInsertPayload({
        loaiPhieu: input.loaiPhieu,
        warehouseId: input.warehouseId,
        sourceWarehouseId: input.sourceWarehouseId,
        lines: input.lines,
        duplicateAcknowledged: !!(
          dup.isDuplicate && input.acknowledgeDuplicate
        ),
      });

      if (!itemRows.length) {
        throw new Error("Không có dòng để tạo đơn.");
      }

      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert(orderRow as never)
        .select("id, order_code")
        .single();

      if (orderErr || !order) {
        throw new Error(orderErr?.message || "Không tạo được đơn hàng.");
      }

      const orderId = (order as { id: string }).id;
      const itemsPayload = itemRows.map((it) => ({
        ...it,
        order_id: orderId,
      }));

      const { error: itemsErr } = await supabase
        .from("order_items")
        .insert(itemsPayload as never);

      if (itemsErr) {
        await supabase.from("orders").delete().eq("id", orderId);
        throw new Error(itemsErr.message || "Không ghi được chi tiết đơn.");
      }

      return {
        orderId,
        orderCode: (order as { order_code: string }).order_code || orderCode,
        itemCount: itemsPayload.length,
      };
    },
  });
}
