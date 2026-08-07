import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  generateOrderCode,
  type PhieuLoai,
} from "@/lib/importOrders";
import {
  inferOrderKind,
  type OrderKind,
} from "@/lib/warehouseOrders";
import {
  buildOrderSkuSignature,
  inferPackingDayFromCreatedAt,
  normalizeOrderCodeText,
} from "@/lib/packingWindows";
import { checkDuplicateBeforeSave } from "@/hooks/useOrderImport";
import { enrichWarehouseMeta, warehouseShortLabel } from "@/lib/warehouseMeta";
import { notifyWarehouseEvent } from "@/lib/telegramNotify";
import { toStockUnitKey } from "@/lib/stockKeys";
import { ensureProductsForOrderLines } from "@/lib/ensureOrderProducts";

export { warehouseShortLabel };

export interface WarehouseOrderItem {
  id: string;
  product_name: string;
  product_slug: string | null;
  price: number;
  quantity: number;
  qty_requested: number | null;
  qty_packed: number | null;
  qty_received: number | null;
  line_notes?: string | null;
  barcode?: string | null;
  unit?: string | null;
  /** Join products — cờ thị giác GAS */
  is_new?: boolean;
  is_out_stock?: boolean;
  is_locked?: boolean;
}

export interface WarehouseOrder {
  id: string;
  order_code: string | null;
  order_kind: OrderKind;
  customer_name: string;
  status: string;
  created_at: string;
  updated_at?: string | null;
  notes: string | null;
  warehouse_id: string | null;
  source_warehouse_id: string | null;
  packing_date: string | null;
  packing_shift: string | null;
  total_amount: number;
  source_warehouse?: {
    id: string;
    code: string;
    name: string;
    address?: string | null;
    short_name?: string | null;
    print_name?: string | null;
  } | null;
  warehouse?: {
    id: string;
    code: string;
    name: string;
    address?: string | null;
    short_name?: string | null;
    print_name?: string | null;
  } | null;
  order_items: WarehouseOrderItem[];
  totalRequested: number;
  totalPacked: number;
  totalReceived: number;
}

export interface WarehouseOrderFilters {
  kind?: OrderKind | "ALL";
  status?: string | "ALL";
  warehouseId?: string | null;
  sourceWarehouseId?: string | null;
  search?: string;
  limit?: number;
}

const ITEM_SELECT =
  "id, product_name, product_slug, price, quantity, qty_requested, qty_packed, qty_received, line_notes, barcode, unit";

/** Cơ bản + nhãn Q4 Cũ/Mới — luôn lấy short_name để UI không hiện Q4_275 */
const ORDER_SELECT = `
  id, order_code, order_kind, customer_name, status, created_at, updated_at, notes,
  warehouse_id, source_warehouse_id, packing_date, packing_shift, total_amount,
  source_warehouse:source_warehouse_id ( id, code, name, short_name, print_name, address ),
  warehouse:warehouse_id ( id, code, name, short_name, print_name, address ),
  order_items ( ${ITEM_SELECT} )
`;

const ORDER_SELECT_BASIC = `
  id, order_code, order_kind, customer_name, status, created_at, updated_at, notes,
  warehouse_id, source_warehouse_id, packing_date, packing_shift, total_amount,
  source_warehouse:source_warehouse_id ( id, code, name ),
  warehouse:warehouse_id ( id, code, name ),
  order_items ( ${ITEM_SELECT} )
`;

async function attachProductFlags(
  items: WarehouseOrderItem[],
): Promise<WarehouseOrderItem[]> {
  const slugs = [
    ...new Set(
      items
        .map((i) => i.product_slug)
        .filter((s): s is string => !!s && s.trim().length > 0),
    ),
  ];
  if (!slugs.length) return items;

  const metaBySlug = new Map<
    string,
    {
      is_new: boolean;
      is_out_stock: boolean;
      is_locked: boolean;
      barcode: string | null;
      unit: string | null;
      barcode_2: string | null;
      unit_2: string | null;
    }
  >();

  for (let i = 0; i < slugs.length; i += 200) {
    const slice = slugs.slice(i, i + 200);
    let data: unknown[] | null = null;
    let error: { message?: string } | null = null;

    const full = await supabase
      .from("products")
      .select(
        "slug, is_new, is_out_stock, is_locked, barcode, unit, barcode_2, unit_2",
      )
      .in("slug", slice);
    if (full.error && /barcode|unit_2|is_new/i.test(full.error.message || "")) {
      const fallback = await supabase
        .from("products")
        .select("slug, barcode, unit")
        .in("slug", slice);
      data = fallback.data;
      error = fallback.error;
    } else {
      data = full.data;
      error = full.error;
    }
    if (error) {
      // Chưa migration — bỏ qua enrich
      return items;
    }
    for (const p of (data as {
      slug: string;
      is_new?: boolean;
      is_out_stock?: boolean;
      is_locked?: boolean;
      barcode?: string | null;
      unit?: string | null;
      barcode_2?: string | null;
      unit_2?: string | null;
    }[] | null) || []) {
      metaBySlug.set(normalizeOrderCodeText(p.slug), {
        is_new: !!p.is_new,
        is_out_stock: !!p.is_out_stock,
        is_locked: !!p.is_locked,
        barcode: p.barcode || null,
        unit: p.unit || null,
        barcode_2: p.barcode_2 || null,
        unit_2: p.unit_2 || null,
      });
    }
  }

  return items.map((it) => {
    const key = normalizeOrderCodeText(it.product_slug || "");
    const f = key ? metaBySlug.get(key) : undefined;
    if (!f) {
      return {
        ...it,
        is_new: false,
        is_out_stock: false,
        is_locked: false,
      };
    }
    // Snapshot trống → backfill từ catalog (đúng ĐVT/MV khi xem phiếu cũ)
    let barcode = it.barcode || null;
    let unit = it.unit || null;
    if (!unit && f.unit) unit = f.unit;
    if (!barcode && f.barcode) barcode = f.barcode;
    // Nếu snapshot ĐVT = unit_2 → dùng barcode_2
    if (
      unit &&
      f.unit_2 &&
      unit.trim().toUpperCase() === f.unit_2.trim().toUpperCase() &&
      f.barcode_2
    ) {
      if (!it.barcode || it.barcode === f.barcode) barcode = f.barcode_2;
    }
    return {
      ...it,
      is_new: f.is_new,
      is_out_stock: f.is_out_stock,
      is_locked: f.is_locked,
      barcode,
      unit,
    };
  });
}

function mapOrder(row: Record<string, unknown>): WarehouseOrder {
  const items = ((row.order_items as WarehouseOrderItem[]) || []).map((it) => ({
    ...it,
    qty_requested: it.qty_requested ?? it.quantity,
    qty_packed: it.qty_packed ?? null,
    qty_received: it.qty_received ?? null,
    line_notes: it.line_notes ?? null,
  }));
  const code = (row.order_code as string) || null;
  return {
    id: row.id as string,
    order_code: code,
    order_kind: (row.order_kind as OrderKind) || inferOrderKind(code),
    customer_name: (row.customer_name as string) || "",
    status: (row.status as string) || "pending",
    created_at: row.created_at as string,
    updated_at: (row.updated_at as string) || null,
    notes: (row.notes as string) || null,
    warehouse_id: (row.warehouse_id as string) || null,
    source_warehouse_id: (row.source_warehouse_id as string) || null,
    packing_date: (row.packing_date as string) || null,
    packing_shift: (row.packing_shift as string) || null,
    total_amount: Number(row.total_amount) || 0,
    source_warehouse: enrichWarehouseMeta(
      (row.source_warehouse as WarehouseOrder["source_warehouse"]) || null,
    ),
    warehouse: enrichWarehouseMeta(
      (row.warehouse as WarehouseOrder["warehouse"]) || null,
    ),
    order_items: items,
    totalRequested: items.reduce(
      (s, i) => s + (i.qty_requested ?? i.quantity ?? 0),
      0,
    ),
    totalPacked: items.reduce((s, i) => s + (i.qty_packed ?? 0), 0),
    totalReceived: items.reduce((s, i) => s + (i.qty_received ?? 0), 0),
  };
}

async function mapOrderWithFlags(
  row: Record<string, unknown>,
): Promise<WarehouseOrder> {
  const order = mapOrder(row);
  order.order_items = await attachProductFlags(order.order_items);
  return order;
}

/** Resolve kho Q7 id — bắt buộc cho phiếu DH */
async function resolveQ7WarehouseId(): Promise<string> {
  const { data, error } = await supabase
    .from("warehouses" as never)
    .select("id")
    .eq("code", "Q7")
    .maybeSingle();
  if (error) throw error;
  const id = (data as { id: string } | null)?.id;
  if (!id) throw new Error("Không tìm thấy kho Q7 — không tạo được phiếu DH.");
  return id;
}

/**
 * GAS: sửa phiếu đang `processing` → bắt buộc lùi `pending`
 * và xóa toàn bộ qty_packed (coi như chưa soạn).
 */
async function revertToPendingIfProcessing(orderId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();
  if (error) throw error;
  if ((data as { status: string }).status !== "processing") return false;

  const { error: ordErr } = await supabase
    .from("orders")
    .update({ status: "pending" } as never)
    .eq("id", orderId);
  if (ordErr) throw ordErr;

  const { error: itemsErr } = await supabase
    .from("order_items")
    .update({ qty_packed: null } as never)
    .eq("order_id", orderId);
  if (itemsErr) throw itemsErr;
  return true;
}

async function getOrderIdForItem(itemId: string): Promise<string> {
  const { data, error } = await supabase
    .from("order_items")
    .select("order_id")
    .eq("id", itemId)
    .single();
  if (error) throw error;
  return (data as { order_id: string }).order_id;
}

async function loadOrderTelegramCtx(orderId: string) {
  const { data } = await supabase
    .from("orders")
    .select(
      `
      order_code,
      source_warehouse:source_warehouse_id ( code ),
      warehouse:warehouse_id ( code )
    `,
    )
    .eq("id", orderId)
    .maybeSingle();
  const row = data as {
    order_code: string | null;
    source_warehouse: { code: string } | null;
    warehouse: { code: string } | null;
  } | null;
  return {
    soPhieu: row?.order_code || orderId.slice(0, 8),
    khoXuat: warehouseShortLabel(row?.source_warehouse) || "—",
    khoNhan: warehouseShortLabel(row?.warehouse) || "—",
  };
}

export function useWarehouseOrders(filters: WarehouseOrderFilters = {}) {
  return useQuery({
    queryKey: ["warehouse-orders", filters],
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select(ORDER_SELECT)
        .order("created_at", { ascending: false })
        .limit(filters.limit ?? 150);

      if (filters.kind && filters.kind !== "ALL") {
        q = q.eq("order_kind" as never, filters.kind);
      } else {
        q = q.in("order_kind" as never, ["DH", "DC"]);
      }

      if (filters.status && filters.status !== "ALL") {
        q = q.eq("status", filters.status);
      }
      if (filters.warehouseId) {
        q = q.eq("warehouse_id" as never, filters.warehouseId);
      }
      if (filters.sourceWarehouseId) {
        q = q.eq("source_warehouse_id" as never, filters.sourceWarehouseId);
      }
      if (filters.search?.trim()) {
        const s = filters.search.trim();
        q = q.or(`order_code.ilike.%${s}%,customer_name.ilike.%${s}%`);
      }

      const { data, error } = await q;
      if (error && /short_name|print_name|address/i.test(error.message || "")) {
        let q2 = supabase
          .from("orders")
          .select(ORDER_SELECT_BASIC)
          .order("created_at", { ascending: false })
          .limit(filters.limit ?? 150);
        if (filters.kind && filters.kind !== "ALL") {
          q2 = q2.eq("order_kind" as never, filters.kind);
        } else {
          q2 = q2.in("order_kind" as never, ["DH", "DC"]);
        }
        if (filters.status && filters.status !== "ALL") {
          q2 = q2.eq("status", filters.status);
        }
        if (filters.warehouseId) {
          q2 = q2.eq("warehouse_id" as never, filters.warehouseId);
        }
        if (filters.sourceWarehouseId) {
          q2 = q2.eq("source_warehouse_id" as never, filters.sourceWarehouseId);
        }
        if (filters.search?.trim()) {
          const s = filters.search.trim();
          q2 = q2.or(`order_code.ilike.%${s}%,customer_name.ilike.%${s}%`);
        }
        const retry = await q2;
        if (retry.error) throw retry.error;
        return ((retry.data as unknown as Record<string, unknown>[]) || []).map(
          mapOrder,
        );
      }
      if (error) throw error;
      return ((data as unknown as Record<string, unknown>[]) || []).map(mapOrder);
    },
    staleTime: 15_000,
  });
}

export function useWarehouseOrder(orderId: string | null) {
  return useQuery({
    queryKey: ["warehouse-order", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      let { data, error } = await supabase
        .from("orders")
        .select(ORDER_SELECT)
        .eq("id", orderId!)
        .single();

      if (error && /short_name|print_name|address/i.test(error.message || "")) {
        const retry = await supabase
          .from("orders")
          .select(ORDER_SELECT_BASIC)
          .eq("id", orderId!)
          .single();
        data = retry.data;
        error = retry.error;
      }

      // Fallback nếu chưa chạy migration line_notes / barcode / unit
      if (
        error &&
        /line_notes|barcode|unit/i.test(error.message || "")
      ) {
        const fallbackSelect = `
  id, order_code, order_kind, customer_name, status, created_at, updated_at, notes,
  warehouse_id, source_warehouse_id, packing_date, packing_shift, total_amount,
  source_warehouse:source_warehouse_id ( id, code, name ),
  warehouse:warehouse_id ( id, code, name ),
  order_items ( id, product_name, product_slug, price, quantity, qty_requested, qty_packed, qty_received )
`;
        const retry = await supabase
          .from("orders")
          .select(fallbackSelect)
          .eq("id", orderId!)
          .single();
        data = retry.data;
        error = retry.error;
      }
      if (error) throw error;
      return mapOrderWithFlags(data as unknown as Record<string, unknown>);
    },
  });
}

export type SaveOrderInput = {
  loaiPhieu: PhieuLoai;
  /** Bị ghi đè bằng Q7 nếu loaiPhieu === DonHang (DH) */
  sourceWarehouseId: string;
  destWarehouseId: string;
  customerName?: string;
  acknowledgeDuplicate?: boolean;
  lines: {
    productName: string;
    productSlug: string | null;
    quantity: number;
    price?: number;
    barcode?: string | null;
    unit?: string | null;
    /** Có sẵn từ catalog; mã ngoài để null → auto-upsert */
    productId?: string | null;
  }[];
};

export type UpdateOrderInput = {
  orderId: string;
  customerName?: string;
  notes?: string | null;
  destWarehouseId?: string;
  /** Chỉ áp dụng cho DC — DH luôn khóa Q7 */
  sourceWarehouseId?: string;
  lines?: {
    itemId?: string;
    productName: string;
    productSlug: string | null;
    qtyRequested: number;
    price?: number;
  }[];
};

export function useWarehouseOrderMutations() {
  const qc = useQueryClient();

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["warehouse-orders"] }),
      qc.invalidateQueries({ queryKey: ["warehouse-order"] }),
      qc.invalidateQueries({ queryKey: ["internal-transfers"] }),
      qc.invalidateQueries({ queryKey: ["packing-orders"] }),
      qc.invalidateQueries({ queryKey: ["week-orders"] }),
      qc.invalidateQueries({ queryKey: ["stock-on-hand"] }),
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] }),
      qc.invalidateQueries({ queryKey: ["catalog-for-stock-import"] }),
      qc.invalidateQueries({ queryKey: ["products"] }),
    ]);
  };

  /** GAS saveOrder — tạo phiếu pending + duplicate check ≤ 5 phút */
  const saveOrder = useMutation({
    mutationFn: async (input: SaveOrderInput) => {
      const valid = input.lines.filter((l) => l.quantity > 0);
      if (!valid.length) throw new Error("Cần ít nhất 1 dòng hàng.");

      for (const l of valid) {
        const sku = normalizeOrderCodeText(l.productSlug || "");
        const name = String(l.productName || "").trim();
        if (!sku) {
          throw new Error("Mỗi dòng cần Mã hàng (SKU).");
        }
        if (!name) {
          throw new Error(`Thiếu tên hàng cho mã ${sku}.`);
        }
      }

      const kind = input.loaiPhieu === "DonHang" ? "DH" : "DC";

      // RULE: DH → kho xuất bắt buộc Q7
      let sourceWarehouseId = input.sourceWarehouseId;
      if (kind === "DH") {
        sourceWarehouseId = await resolveQ7WarehouseId();
      }
      if (!sourceWarehouseId) throw new Error("Thiếu kho xuất.");
      if (!input.destWarehouseId) throw new Error("Thiếu kho nhận.");

      // Cách 2: mã ngoài → upsert products (is_new) trước khi insert order_items
      const productIds = await ensureProductsForOrderLines(
        valid.map((l) => ({
          productSlug: l.productSlug,
          productName: l.productName,
          barcode: l.barcode,
          unit: l.unit,
          productId: l.productId,
        })),
      );

      const skuQty: Record<string, number> = {};
      let totalQty = 0;
      for (const l of valid) {
        totalQty += l.quantity;
        const k = normalizeOrderCodeText(l.productSlug || l.productName);
        if (k) skuQty[k] = (skuQty[k] || 0) + l.quantity;
      }
      const skuSignature = buildOrderSkuSignature(skuQty);

      const dup = await checkDuplicateBeforeSave(
        input.destWarehouseId,
        totalQty,
        skuSignature,
      );
      if (dup.isDuplicate && !input.acknowledgeDuplicate) {
        const err = new Error(
          `DUP:${dup.peerOrderCode || dup.peerId}:${dup.reason || ""}`,
        );
        (err as Error & { duplicate: typeof dup }).duplicate = dup;
        throw err;
      }

      const now = new Date();
      const inferred = inferPackingDayFromCreatedAt(now);
      const orderCode = generateOrderCode(input.loaiPhieu);
      const total = valid.reduce(
        (s, l) => s + (l.price || 0) * l.quantity,
        0,
      );

      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          order_code: orderCode,
          order_kind: kind,
          customer_name:
            input.customerName ||
            (kind === "DH" ? "Đơn hàng nội bộ" : "Điều chuyển nội bộ"),
          warehouse_id: input.destWarehouseId,
          source_warehouse_id: sourceWarehouseId,
          packing_date: inferred.win.packingDayStr,
          packing_shift: inferred.mode === "supp" ? "supplement" : "main",
          status: "pending",
          total_amount: total,
          subtotal: total,
          shipping_fee: 0,
          is_free_shipping: true,
          notes: "Tạo thủ công từ hub phiếu kho",
          duplicate_accepted: !!(dup.isDuplicate && input.acknowledgeDuplicate),
        } as never)
        .select("id, order_code")
        .single();

      if (error || !order) {
        throw new Error(error?.message || "Không tạo được phiếu.");
      }

      const orderId = (order as { id: string }).id;
      const items = valid.map((l) => {
        const slug = normalizeOrderCodeText(l.productSlug || "");
        const pid = productIds.get(slug) || l.productId || null;
        return {
          order_id: orderId,
          product_name: l.productName,
          product_slug: l.productSlug,
          product_image: null,
          price: l.price || 0,
          quantity: l.quantity,
          qty_requested: l.quantity,
          qty_packed: null,
          qty_received: null,
          shipping_fee: 0,
          barcode: l.barcode || null,
          unit: l.unit || null,
          ...(pid ? { product_id: pid } : {}),
        };
      });

      const { error: itemsErr } = await supabase
        .from("order_items")
        .insert(items as never);
      if (itemsErr) {
        // Fallback: schema chưa có cột product_id
        if (/product_id/i.test(itemsErr.message || "")) {
          const stripped = items.map(({ product_id: _pid, ...rest }) => {
            void _pid;
            return rest;
          });
          const { error: retryErr } = await supabase
            .from("order_items")
            .insert(stripped as never);
          if (retryErr) {
            await supabase.from("orders").delete().eq("id", orderId);
            throw new Error(retryErr.message);
          }
        } else {
          await supabase.from("orders").delete().eq("id", orderId);
          throw new Error(itemsErr.message);
        }
      }

      const code = (order as { order_code: string }).order_code;
      void notifyWarehouseEvent({
        event: "order_created",
        soPhieu: code,
        khoXuat: kind === "DH" ? "Q7" : "—",
        khoNhan: "—",
        extra: `${valid.length} dòng · ${kind}`,
      });

      return order as { id: string; order_code: string };
    },
    onSuccess: invalidate,
  });

  /**
   * GAS updateOrder — mọi thay đổi item khi đang processing
   * → status = pending + qty_packed = null toàn phiếu.
   */
  const updateOrder = useMutation({
    mutationFn: async (input: UpdateOrderInput) => {
      const { data: existing, error: loadErr } = await supabase
        .from("orders")
        .select("id, status, order_kind, source_warehouse_id")
        .eq("id", input.orderId)
        .single();
      if (loadErr) throw loadErr;
      const ord = existing as {
        status: string;
        order_kind: string | null;
        source_warehouse_id: string | null;
      };
      if (ord.status === "completed" || ord.status === "cancelled") {
        throw new Error("Không sửa được phiếu đã nhận / đã hủy.");
      }

      const patch: Record<string, unknown> = {};
      if (input.customerName != null) patch.customer_name = input.customerName;
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.destWarehouseId) patch.warehouse_id = input.destWarehouseId;

      if (input.sourceWarehouseId) {
        if (ord.order_kind === "DH") {
          patch.source_warehouse_id = await resolveQ7WarehouseId();
        } else {
          patch.source_warehouse_id = input.sourceWarehouseId;
        }
      }

      const touchingItems = Array.isArray(input.lines);
      if (touchingItems || Object.keys(patch).length > 0) {
        await revertToPendingIfProcessing(input.orderId);
      }

      if (Object.keys(patch).length > 0) {
        const { error } = await supabase
          .from("orders")
          .update(patch as never)
          .eq("id", input.orderId);
        if (error) throw error;
      }

      if (input.lines) {
        for (const line of input.lines) {
          if (line.itemId) {
            const { error } = await supabase
              .from("order_items")
              .update({
                product_name: line.productName,
                product_slug: line.productSlug,
                quantity: line.qtyRequested,
                qty_requested: line.qtyRequested,
                qty_packed: null,
                price: line.price ?? 0,
              } as never)
              .eq("id", line.itemId);
            if (error) throw error;
          } else if (line.qtyRequested > 0) {
            const { error } = await supabase.from("order_items").insert({
              order_id: input.orderId,
              product_name: line.productName,
              product_slug: line.productSlug,
              quantity: line.qtyRequested,
              qty_requested: line.qtyRequested,
              qty_packed: null,
              price: line.price ?? 0,
              shipping_fee: 0,
            } as never);
            if (error) throw error;
          }
        }
      }

      return { orderId: input.orderId, reverted: ord.status === "processing" };
    },
    onSuccess: invalidate,
  });

  const updateItemQty = useMutation({
    mutationFn: async (input: {
      itemId: string;
      qtyRequested?: number;
      quantity?: number;
    }) => {
      const orderId = await getOrderIdForItem(input.itemId);
      await revertToPendingIfProcessing(orderId);

      const patch: Record<string, unknown> = { qty_packed: null };
      if (input.qtyRequested != null) {
        patch.qty_requested = input.qtyRequested;
        patch.quantity = input.qtyRequested;
      }
      if (input.quantity != null) {
        patch.quantity = input.quantity;
        patch.qty_requested = input.quantity;
      }
      const { error } = await supabase
        .from("order_items")
        .update(patch as never)
        .eq("id", input.itemId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /**
   * Đổi ĐVT trên chi tiết / soạn hàng — sync barcode, giữ status packing.
   * Không gọi revertToPendingIfProcessing (tránh xóa qty_packed).
   */
  const updateItemUnit = useMutation({
    mutationFn: async (input: {
      itemId: string;
      unit: string;
      barcode: string | null;
      /** Ghi chú audit gắn line_notes */
      auditNote?: string | null;
    }) => {
      const unit = String(input.unit || "").trim();
      if (!unit) throw new Error("Thiếu ĐVT.");

      const { data: row, error: loadErr } = await supabase
        .from("order_items")
        .select("id, order_id, line_notes, unit, barcode, product_slug")
        .eq("id", input.itemId)
        .single();
      if (loadErr) throw loadErr;

      const item = row as {
        order_id: string;
        line_notes: string | null;
        unit: string | null;
        barcode: string | null;
        product_slug: string | null;
      };

      const { data: ord, error: ordErr } = await supabase
        .from("orders")
        .select("status")
        .eq("id", item.order_id)
        .single();
      if (ordErr) throw ordErr;
      const st = (ord as { status: string }).status;
      if (st === "completed" || st === "cancelled") {
        throw new Error("Không sửa ĐVT phiếu đã nhận / đã hủy.");
      }

      let lineNotes = item.line_notes || null;
      if (input.auditNote) {
        lineNotes = [item.line_notes, input.auditNote]
          .map((s) => String(s || "").trim())
          .filter(Boolean)
          .join("\n");
      }

      const patch: Record<string, unknown> = {
        unit,
        barcode: input.barcode,
      };
      if (input.auditNote) patch.line_notes = lineNotes;

      const { error } = await supabase
        .from("order_items")
        .update(patch as never)
        .eq("id", input.itemId);
      if (error) {
        if (/barcode|unit|line_notes/i.test(error.message || "")) {
          const { error: retry } = await supabase
            .from("order_items")
            .update({ unit, barcode: input.barcode } as never)
            .eq("id", input.itemId);
          if (retry) throw retry;
        } else {
          throw error;
        }
      }
    },
    onSuccess: invalidate,
  });

  const addItem = useMutation({
    mutationFn: async (input: {
      orderId: string;
      productName: string;
      productSlug?: string | null;
      quantity: number;
      price?: number;
      barcode?: string | null;
      unit?: string | null;
      productId?: string | null;
    }) => {
      if (input.quantity <= 0) throw new Error("Số lượng phải > 0");
      const slug = normalizeOrderCodeText(input.productSlug || "");
      const name = String(input.productName || "").trim();
      if (!slug) throw new Error("Thiếu Mã hàng (SKU).");
      if (!name) throw new Error(`Thiếu tên hàng cho mã ${slug}.`);

      await revertToPendingIfProcessing(input.orderId);

      const productIds = await ensureProductsForOrderLines([
        {
          productSlug: slug,
          productName: name,
          barcode: input.barcode,
          unit: input.unit,
          productId: input.productId,
        },
      ]);
      const pid = productIds.get(slug) || input.productId || null;

      const row: Record<string, unknown> = {
        order_id: input.orderId,
        product_name: name,
        product_slug: slug,
        price: input.price || 0,
        quantity: input.quantity,
        qty_requested: input.quantity,
        qty_packed: null,
        shipping_fee: 0,
        barcode: input.barcode || null,
        unit: input.unit || null,
      };
      if (pid) row.product_id = pid;

      const { error } = await supabase
        .from("order_items")
        .insert(row as never);
      if (error) {
        if (/product_id/i.test(error.message || "") && pid) {
          delete row.product_id;
          const { error: retryErr } = await supabase
            .from("order_items")
            .insert(row as never);
          if (retryErr) throw retryErr;
        } else {
          throw error;
        }
      }
    },
    onSuccess: invalidate,
  });

  const removeItem = useMutation({
    mutationFn: async (itemId: string) => {
      const orderId = await getOrderIdForItem(itemId);
      await revertToPendingIfProcessing(orderId);
      const { error } = await supabase
        .from("order_items")
        .delete()
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const cancelOrder = useMutation({
    mutationFn: async (orderId: string) => {
      const ctx = await loadOrderTelegramCtx(orderId);
      const { error } = await supabase
        .from("orders")
        .update({ status: "cancelled" } as never)
        .eq("id", orderId);
      if (error) throw error;
      void notifyWarehouseEvent({
        event: "order_cancelled",
        ...ctx,
      });
    },
    onSuccess: invalidate,
  });

  /** Admin: khôi phục phiếu đã hủy → pending */
  const restoreOrder = useMutation({
    mutationFn: async (orderId: string) => {
      const { data: ord, error: loadErr } = await supabase
        .from("orders")
        .select("status")
        .eq("id", orderId)
        .single();
      if (loadErr) throw loadErr;
      if ((ord as { status: string }).status !== "cancelled") {
        throw new Error("Chỉ khôi phục phiếu đã hủy.");
      }
      const ctx = await loadOrderTelegramCtx(orderId);
      const { error } = await supabase
        .from("orders")
        .update({ status: "pending" } as never)
        .eq("id", orderId);
      if (error) throw error;
      void notifyWarehouseEvent({
        event: "order_restored",
        ...ctx,
      });
    },
    onSuccess: invalidate,
  });

  /** Admin: sửa trạng thái tự do (GAS-like) */
  const setOrderStatus = useMutation({
    mutationFn: async (input: {
      orderId: string;
      status: string;
    }) => {
      const allowed = [
        "pending",
        "processing",
        "completed",
        "cancelled",
      ];
      if (!allowed.includes(input.status)) {
        throw new Error(`Trạng thái không hợp lệ: ${input.status}`);
      }
      const ctx = await loadOrderTelegramCtx(input.orderId);
      const { error } = await supabase
        .from("orders")
        .update({ status: input.status } as never)
        .eq("id", input.orderId);
      if (error) throw error;
      void notifyWarehouseEvent({
        event: "order_changed",
        ...ctx,
        extra: `TT → ${input.status}`,
      });
    },
    onSuccess: invalidate,
  });

  /** GAS savePackingQty / luuSoSoanHang — status processing */
  const savePackingQty = useMutation({
    mutationFn: async (input: {
      orderId: string;
      lines: {
        itemId: string;
        qtyPacked: number;
        unit?: string | null;
        barcode?: string | null;
      }[];
    }) => {
      const { data: ord, error: loadErr } = await supabase
        .from("orders")
        .select("status")
        .eq("id", input.orderId)
        .single();
      if (loadErr) throw loadErr;
      const st = (ord as { status: string }).status;
      if (st === "completed" || st === "cancelled") {
        throw new Error("Không soạn được phiếu đã nhận / đã hủy.");
      }

      for (const line of input.lines) {
        const patch: Record<string, unknown> = {
          qty_packed: line.qtyPacked,
        };
        if (line.unit != null && String(line.unit).trim()) {
          patch.unit = String(line.unit).trim();
        }
        if (line.barcode !== undefined) {
          patch.barcode = line.barcode;
        }
        const { error } = await supabase
          .from("order_items")
          .update(patch as never)
          .eq("id", line.itemId);
        if (error) throw error;
      }
      const { error } = await supabase
        .from("orders")
        .update({ status: "processing" } as never)
        .eq("id", input.orderId);
      if (error) throw error;

      const ctx = await loadOrderTelegramCtx(input.orderId);
      void notifyWarehouseEvent({
        event: "order_packed",
        ...ctx,
        extra: `${input.lines.length} dòng đã soạn`,
      });
    },
    onSuccess: invalidate,
  });

  /** GAS confirmReceive + trừ stock_on_hand kho xuất theo qty_received */
  const confirmReceive = useMutation({
    mutationFn: async (input: {
      orderId: string;
      lines: {
        itemId: string;
        qtyReceived: number;
        productSlug: string | null;
        unit?: string | null;
      }[];
      sourceWarehouseId: string;
    }) => {
      if (!input.sourceWarehouseId) {
        throw new Error("Thiếu kho xuất — không trừ tồn được.");
      }

      const { data: ord, error: loadErr } = await supabase
        .from("orders")
        .select("status")
        .eq("id", input.orderId)
        .single();
      if (loadErr) throw loadErr;
      const st = (ord as { status: string }).status;
      if (st === "completed") throw new Error("Phiếu đã nhận rồi.");
      if (st === "cancelled") throw new Error("Phiếu đã hủy.");

      for (const line of input.lines) {
        const { error } = await supabase
          .from("order_items")
          .update({ qty_received: line.qtyReceived } as never)
          .eq("id", line.itemId);
        if (error) throw error;
      }

      for (const line of input.lines) {
        const deduct = line.qtyReceived;
        if (deduct <= 0 || !line.productSlug) continue;

        const { data: product } = await supabase
          .from("products")
          .select("id, stock_quantity, unit, unit_2")
          .eq("slug", line.productSlug)
          .maybeSingle();

        if (!product) continue;
        const productId = (product as { id: string }).id;
        const unitLabel =
          String(line.unit || "").trim() ||
          String((product as { unit: string | null }).unit || "").trim() ||
          "cái";
        const unitKey = toStockUnitKey(unitLabel);

        const withUnit = await supabase
          .from("stock_on_hand" as never)
          .select("id, quantity, unit_key")
          .eq("warehouse_id", input.sourceWarehouseId)
          .eq("product_id", productId)
          .eq("unit_key", unitKey)
          .maybeSingle();

        let stock = withUnit.data as {
          id: string;
          quantity: number;
          unit_key?: string;
        } | null;
        const stockErr = withUnit.error;

        if (
          (stockErr && /unit_key|column/i.test(stockErr.message || "")) ||
          (!stock && !stockErr)
        ) {
          const fb = await supabase
            .from("stock_on_hand" as never)
            .select("id, quantity")
            .eq("warehouse_id", input.sourceWarehouseId)
            .eq("product_id", productId)
            .limit(1)
            .maybeSingle();
          if (!fb.error) {
            stock = fb.data as { id: string; quantity: number } | null;
          }
        }

        const current = stock?.quantity ?? 0;
        const next = Math.max(0, current - deduct);

        if (stock) {
          const { error } = await supabase
            .from("stock_on_hand" as never)
            .update({
              quantity: next,
              updated_at: new Date().toISOString(),
            } as never)
            .eq("id", stock.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("stock_on_hand" as never).insert({
            warehouse_id: input.sourceWarehouseId,
            product_id: productId,
            quantity: 0,
            unit: unitLabel,
            unit_key: unitKey,
          } as never);
          if (error && /unit_key|column/i.test(error.message || "")) {
            const fb = await supabase.from("stock_on_hand" as never).insert({
              warehouse_id: input.sourceWarehouseId,
              product_id: productId,
              quantity: 0,
            } as never);
            if (fb.error) throw fb.error;
          } else if (error) {
            throw error;
          }
        }

        const { data: wh } = await supabase
          .from("warehouses" as never)
          .select("code")
          .eq("id", input.sourceWarehouseId)
          .maybeSingle();
        if ((wh as { code: string } | null)?.code === "Q7") {
          const { data: allUnits } = await supabase
            .from("stock_on_hand" as never)
            .select("quantity")
            .eq("warehouse_id", input.sourceWarehouseId)
            .eq("product_id", productId);
          const sum = ((allUnits as { quantity: number }[] | null) ?? []).reduce(
            (s, r) => s + (Number(r.quantity) || 0),
            0,
          );
          await supabase
            .from("products")
            .update({ stock_quantity: Math.max(0, sum) } as never)
            .eq("id", productId);
        }
      }

      const { error } = await supabase
        .from("orders")
        .update({
          status: "completed",
          notes: "Đã xác nhận nhận hàng (port GAS xacNhanNhanHang)",
        } as never)
        .eq("id", input.orderId);
      if (error) throw error;

      const ctx = await loadOrderTelegramCtx(input.orderId);
      void notifyWarehouseEvent({
        event: "order_received",
        ...ctx,
        extra: `Trừ tồn theo ${input.lines.length} dòng nhận`,
      });
    },
    onSuccess: invalidate,
  });

  return {
    /** Alias GAS */
    saveOrder,
    updateOrder,
    savePackingQty,
    confirmReceive,
    /** Tên cũ — tương thích UI hiện có */
    createOrder: saveOrder,
    savePacking: savePackingQty,
    updateItemQty,
    updateItemUnit,
    addItem,
    removeItem,
    cancelOrder,
    restoreOrder,
    setOrderStatus,
  };
}
