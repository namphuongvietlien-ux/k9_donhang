import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  isActiveTransferStatus,
  mapOrderStatusToTransfer,
  type TransferStatus,
} from "@/lib/internalTransfers";

export interface InternalTransferRow {
  id: string;
  code: string;
  fromWarehouse: string;
  toWarehouse: string;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
  status: TransferStatus;
  qtyShipped: number;
  qtyReceived: number | null;
  hasMismatch: boolean;
  createdAt: string;
  orderStatus: string;
}

interface OrderTransferRaw {
  id: string;
  order_code: string | null;
  status: string | null;
  created_at: string;
  source_warehouse_id: string | null;
  warehouse_id: string | null;
  source_warehouse: { id: string; code: string; name: string } | null;
  warehouse: { id: string; code: string; name: string } | null;
  order_items: {
    quantity: number;
    qty_requested: number | null;
    qty_packed: number | null;
    qty_received: number | null;
  }[] | null;
}

function toRow(o: OrderTransferRaw): InternalTransferRow {
  const items = o.order_items || [];
  const qtyShipped = items.reduce((s, it) => {
    const packed = it.qty_packed;
    const req = it.qty_requested ?? it.quantity;
    return s + (packed != null ? packed : req || 0);
  }, 0);

  const hasAnyReceived = items.some((it) => it.qty_received != null);
  const qtyReceived = hasAnyReceived
    ? items.reduce((s, it) => s + (it.qty_received ?? 0), 0)
    : null;

  const status = mapOrderStatusToTransfer(
    o.status,
    qtyShipped,
    qtyReceived,
  );
  const hasMismatch =
    status === "mismatch" ||
    (qtyReceived != null && qtyShipped > 0 && qtyReceived !== qtyShipped);

  return {
    id: o.id,
    code: o.order_code || o.id.slice(0, 8).toUpperCase(),
    fromWarehouse:
      o.source_warehouse?.code || o.source_warehouse?.name || "—",
    toWarehouse: o.warehouse?.code || o.warehouse?.name || "—",
    fromWarehouseId: o.source_warehouse_id,
    toWarehouseId: o.warehouse_id,
    status,
    qtyShipped,
    qtyReceived,
    hasMismatch,
    createdAt: o.created_at,
    orderStatus: o.status || "pending",
  };
}

async function fetchInternalTransfers(): Promise<InternalTransferRow[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id, order_code, status, created_at,
      source_warehouse_id, warehouse_id,
      source_warehouse:source_warehouse_id ( id, code, name ),
      warehouse:warehouse_id ( id, code, name ),
      order_items ( quantity, qty_requested, qty_packed, qty_received )
    `,
    )
    .not("source_warehouse_id", "is", null)
    .not("warehouse_id", "is", null)
    .neq("status", "cancelled")
    .or("order_kind.eq.DC,order_code.ilike.DC-%")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  return ((data as unknown as OrderTransferRaw[]) || []).map(toRow);
}

export function useInternalTransfers() {
  return useQuery({
    queryKey: ["internal-transfers"],
    queryFn: fetchInternalTransfers,
    staleTime: 30_000,
  });
}

export function useInternalTransferStats() {
  const q = useInternalTransfers();
  const rows = q.data || [];

  const activeTransfers = rows.filter((r) => isActiveTransferStatus(r.status));
  const inTransit = rows.filter((r) => r.status === "in_transit");
  const mismatchCount = rows.filter((r) => r.hasMismatch).length;
  const unitsInTransit = inTransit.reduce((s, r) => s + r.qtyShipped, 0);

  return {
    ...q,
    activeTransferCount: activeTransfers.length,
    inTransitCount: inTransit.length,
    unitsInTransit,
    mismatchCount,
  };
}
