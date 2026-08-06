import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  attachDuplicateSuspects,
  buildOrderSkuSignature,
  getPackingDayWindows,
  inferPackingDayFromCreatedAt,
  isInPackingModeWindow,
  normalizeOrderCodeText,
  normalizePackingMode,
  toHoChiMinhMillis,
  type PackingMode,
} from "@/lib/packingWindows";

export interface PackingOrderItem {
  id: string;
  product_name: string;
  product_slug: string | null;
  quantity: number;
  qty_requested?: number | null;
  price: number;
  unit?: string | null;
  barcode?: string | null;
}

export interface PackingOrder {
  id: string;
  order_code: string | null;
  customer_name: string;
  status: string;
  created_at: string;
  warehouse_id: string | null;
  source_warehouse_id?: string | null;
  packing_date: string | null;
  packing_shift: string | null;
  duplicate_accepted: boolean;
  warehouse?: { id: string; code: string; name: string } | null;
  order_items?: PackingOrderItem[];
  totalQty: number;
  skuSignature: string;
  createdAtMs: number;
  inMain: boolean;
  inSupp: boolean;
  isDuplicateSuspect?: boolean;
  duplicateSuspect?: {
    peerSoPhieu: string;
    peerId?: string;
    peerCreatedAt: number;
    peerCreatedUi: string;
    reason: string;
    acknowledged: boolean;
  };
}

function mapStatusToCancelled(status: string) {
  const s = status.toLowerCase();
  return s === "cancelled" || s.includes("hủy") || s.includes("huy");
}

async function fetchPackingOrders(params: {
  packingDateYYYYMMDD: string;
  mode: PackingMode;
  warehouseId?: string | null;
  sourceWarehouseId?: string | null;
}) {
  const packingDay = new Date(`${params.packingDateYYYYMMDD}T00:00:00`);
  const win = getPackingDayWindows(packingDay);
  const mode = normalizePackingMode(params.mode);

  let query = supabase
    .from("orders")
    .select(
      `
      id, order_code, customer_name, status, created_at,
      warehouse_id, source_warehouse_id, packing_date, packing_shift, duplicate_accepted,
      warehouse:warehouse_id ( id, code, name ),
      order_items ( id, product_name, product_slug, quantity, qty_requested, price, unit, barcode )
    `,
    )
    .gte("created_at", new Date(win.startMs).toISOString())
    .lt("created_at", new Date(win.endMs).toISOString())
    .order("created_at", { ascending: true })
    .limit(500);

  if (params.warehouseId) {
    query = query.eq("warehouse_id" as never, params.warehouseId);
  }
  if (params.sourceWarehouseId) {
    query = query.eq("source_warehouse_id" as never, params.sourceWarehouseId);
  }

  const { data, error } = await query;
  if (error && /barcode|unit|qty_requested/i.test(error.message || "")) {
    let q2 = supabase
      .from("orders")
      .select(
        `
        id, order_code, customer_name, status, created_at,
        warehouse_id, source_warehouse_id, packing_date, packing_shift, duplicate_accepted,
        warehouse:warehouse_id ( id, code, name ),
        order_items ( id, product_name, product_slug, quantity, price )
      `,
      )
      .gte("created_at", new Date(win.startMs).toISOString())
      .lt("created_at", new Date(win.endMs).toISOString())
      .order("created_at", { ascending: true })
      .limit(500);
    if (params.warehouseId) {
      q2 = q2.eq("warehouse_id" as never, params.warehouseId);
    }
    if (params.sourceWarehouseId) {
      q2 = q2.eq("source_warehouse_id" as never, params.sourceWarehouseId);
    }
    const retry = await q2;
    if (retry.error) throw retry.error;
    return mapPackingRows(retry.data, win, mode);
  }
  if (error) throw error;

  return mapPackingRows(data, win, mode);
}

function mapPackingRows(
  data: unknown,
  win: ReturnType<typeof getPackingDayWindows>,
  mode: PackingMode,
): PackingOrder[] {
  type Raw = {
    id: string;
    order_code: string | null;
    customer_name: string;
    status: string;
    created_at: string;
    warehouse_id: string | null;
    source_warehouse_id: string | null;
    packing_date: string | null;
    packing_shift: string | null;
    duplicate_accepted: boolean | null;
    warehouse: { id: string; code: string; name: string } | null;
    order_items: PackingOrderItem[] | null;
  };

  const mapped: PackingOrder[] = [];

  for (const row of (data as unknown as Raw[] | null) ?? []) {
    if (mapStatusToCancelled(row.status)) continue;
    const st = String(row.status || "").toLowerCase();
    if (st === "completed" || st.includes("nhận") || st.includes("nhan")) continue;

    const items = (row.order_items || []).filter((it) => {
      const q = Number(it.qty_requested ?? it.quantity) || 0;
      return q > 0;
    });
    const skuQty: Record<string, number> = {};
    let totalQty = 0;
    for (const it of items) {
      const q = Number(it.qty_requested ?? it.quantity) || 0;
      totalQty += q;
      const key = normalizeOrderCodeText(it.product_slug || it.product_name);
      if (key) skuQty[key] = (skuQty[key] || 0) + q;
    }

    const createdAtMs = toHoChiMinhMillis(row.created_at);
    if (!isInPackingModeWindow(createdAtMs, win, mode)) continue;

    mapped.push({
      id: row.id,
      order_code: row.order_code,
      customer_name: row.customer_name,
      status: row.status,
      created_at: row.created_at,
      warehouse_id: row.warehouse_id,
      source_warehouse_id: row.source_warehouse_id,
      packing_date: row.packing_date,
      packing_shift: row.packing_shift,
      duplicate_accepted: !!row.duplicate_accepted,
      warehouse: row.warehouse,
      order_items: items,
      totalQty,
      skuSignature: buildOrderSkuSignature(skuQty),
      createdAtMs,
      inMain: createdAtMs >= win.startMs && createdAtMs < win.midMs,
      inSupp: createdAtMs >= win.midMs && createdAtMs < win.endMs,
    });
  }

  return attachDuplicateSuspects(
    mapped.map((o) => ({
      ...o,
      soPhieu: o.order_code || o.id,
      orderCode: o.order_code,
      warehouseId: o.warehouse_id,
      khoNhan: o.warehouse?.code || o.warehouse_id,
      duplicateAccepted: o.duplicate_accepted,
    })),
  ) as PackingOrder[];
}

export function usePackingOrders(options: {
  packingDateYYYYMMDD: string;
  mode?: PackingMode | string;
  warehouseId?: string | null;
  sourceWarehouseId?: string | null;
  enabled?: boolean;
}) {
  const mode = normalizePackingMode(options.mode ?? "total");
  const enabled = options.enabled ?? true;

  const query = useQuery({
    queryKey: [
      "packing-orders",
      options.packingDateYYYYMMDD,
      mode,
      options.warehouseId,
      options.sourceWarehouseId,
    ],
    queryFn: () =>
      fetchPackingOrders({
        packingDateYYYYMMDD: options.packingDateYYYYMMDD,
        mode,
        warehouseId: options.warehouseId,
        sourceWarehouseId: options.sourceWarehouseId,
      }),
    enabled: enabled && !!options.packingDateYYYYMMDD,
  });

  return {
    orders: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useWeekOrders(options: {
  weekStartYYYYMMDD: string;
  warehouseId?: string | null;
  enabled?: boolean;
}) {
  const enabled = options.enabled ?? true;

  return useQuery({
    queryKey: ["week-orders", options.weekStartYYYYMMDD, options.warehouseId],
    enabled: enabled && !!options.weekStartYYYYMMDD,
    queryFn: async () => {
      const weekStart = new Date(`${options.weekStartYYYYMMDD}T00:00:00`);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      let query = supabase
        .from("orders")
        .select(
          `
          id, order_code, customer_name, status, created_at,
          warehouse_id, packing_date, packing_shift, duplicate_accepted,
          warehouse:warehouse_id ( id, code, name ),
          order_items ( id, product_name, product_slug, quantity, price, unit, barcode )
        `,
        )
        .gte("created_at", weekStart.toISOString())
        .lt("created_at", weekEnd.toISOString())
        .order("created_at", { ascending: true })
        .limit(1000);

      if (options.warehouseId) {
        query = query.eq("warehouse_id" as never, options.warehouseId);
      }

      const { data, error } = await query;
      if (error) throw error;

      type Raw = {
        id: string;
        order_code: string | null;
        customer_name: string;
        status: string;
        created_at: string;
        warehouse_id: string | null;
        packing_date: string | null;
        packing_shift: string | null;
        duplicate_accepted: boolean | null;
        warehouse: { id: string; code: string; name: string } | null;
        order_items: PackingOrderItem[] | null;
      };

      const mapped = ((data as unknown as Raw[] | null) ?? [])
        .filter((r) => !mapStatusToCancelled(r.status))
        .map((row) => {
          const items = row.order_items || [];
          const skuQty: Record<string, number> = {};
          let totalQty = 0;
          for (const it of items) {
            totalQty += it.quantity;
            const key = normalizeOrderCodeText(it.product_slug || it.product_name);
            if (key) skuQty[key] = (skuQty[key] || 0) + it.quantity;
          }
          const createdAtMs = toHoChiMinhMillis(row.created_at);
          return {
            id: row.id,
            order_code: row.order_code,
            customer_name: row.customer_name,
            status: row.status,
            created_at: row.created_at,
            warehouse_id: row.warehouse_id,
            packing_date: row.packing_date,
            packing_shift: row.packing_shift,
            duplicate_accepted: !!row.duplicate_accepted,
            warehouse: row.warehouse,
            order_items: items,
            totalQty,
            skuSignature: buildOrderSkuSignature(skuQty),
            createdAtMs,
            inMain: false,
            inSupp: false,
            soPhieu: row.order_code || row.id,
            orderCode: row.order_code,
            warehouseId: row.warehouse_id,
            khoNhan: row.warehouse?.code || row.warehouse_id,
            duplicateAccepted: !!row.duplicate_accepted,
          };
        });

      return attachDuplicateSuspects(mapped) as PackingOrder[];
    },
  });
}

export function useOrderMutations() {
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["packing-orders"] });
    qc.invalidateQueries({ queryKey: ["week-orders"] });
    qc.invalidateQueries({ queryKey: ["branch-sku-history"] });
  }, [qc]);

  const acknowledgeDuplicate = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from("orders")
        .update({ duplicate_accepted: true } as never)
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const cancelOrder = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from("orders")
        .update({ status: "cancelled" } as never)
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const assignWarehouseAndShift = useMutation({
    mutationFn: async (payload: {
      orderId: string;
      warehouseId?: string | null;
      sourceWarehouseId?: string | null;
    }) => {
      const { data: order } = await supabase
        .from("orders")
        .select("created_at")
        .eq("id", payload.orderId)
        .single();

      const inferred = order?.created_at
        ? inferPackingDayFromCreatedAt(order.created_at)
        : null;

      const patch: Record<string, unknown> = {};
      if (payload.warehouseId !== undefined) patch.warehouse_id = payload.warehouseId;
      if (payload.sourceWarehouseId !== undefined) {
        patch.source_warehouse_id = payload.sourceWarehouseId;
      }
      if (inferred) {
        patch.packing_date = inferred.win.packingDayStr;
        patch.packing_shift = inferred.mode === "supp" ? "supplement" : "main";
      }

      const { error } = await supabase
        .from("orders")
        .update(patch as never)
        .eq("id", payload.orderId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { acknowledgeDuplicate, cancelOrder, assignWarehouseAndShift };
}

/** Alias for user-requested useOrders */
export function useOrders(options: {
  packingDateYYYYMMDD?: string;
  mode?: PackingMode | string;
  warehouseId?: string | null;
}) {
  const { orders, loading, error, refetch } = usePackingOrders({
    packingDateYYYYMMDD: options.packingDateYYYYMMDD || "",
    mode: options.mode,
    warehouseId: options.warehouseId,
    enabled: !!options.packingDateYYYYMMDD,
  });
  const mutations = useOrderMutations();

  return {
    orders,
    loading,
    error,
    refetch,
    ...mutations,
  };
}

/** PRD Phần 3 — re-export để gọi từ useOrders */
export { checkDuplicateBeforeSave } from "@/hooks/useOrderImport";
export type { DuplicatePreSaveResult } from "@/hooks/useOrderImport";

/** Phase 1 Hub DH/DC — queries/mutations vòng đời (không re-export useOrderMutations: trùng tên packing) */
export {
  useWarehouseOrderMutations,
  useWarehouseOrders,
  useWarehouseOrder,
} from "@/hooks/useWarehouseOrders";
export type {
  SaveOrderInput,
  UpdateOrderInput,
} from "@/hooks/useWarehouseOrders";
