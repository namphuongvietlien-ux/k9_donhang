import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  formatOrderTimestampUi,
  normalizeOrderCodeText,
  toDateKey,
  toHoChiMinhMillis,
} from "@/lib/packingWindows";

export interface BranchSkuHistoryEntry {
  maHang: string;
  maHangKey: string;
  qty: number;
  soPhieu: string;
  createdAtMs: number;
  createdUi: string;
  dateLabel: string;
  storeLabel: string;
}

/**
 * Port of GAS getBranchSkuHistory_:
 * Latest outbound/order line per SKU at kho nhận within last N days.
 */
export function useBranchSkuHistory(options: {
  warehouseId?: string | null;
  excludeOrderId?: string | null;
  daysBack?: number;
  enabled?: boolean;
}) {
  const days = Math.min(Math.max(options.daysBack ?? 7, 1), 31);
  const enabled = (options.enabled ?? true) && !!options.warehouseId;

  return useQuery({
    queryKey: [
      "branch-sku-history",
      options.warehouseId,
      options.excludeOrderId,
      days,
    ],
    enabled,
    queryFn: async () => {
      const start = new Date();
      start.setDate(start.getDate() - days);
      start.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          id, order_code, created_at, status, warehouse_id,
          warehouse:warehouse_id ( code, name ),
          order_items ( product_slug, product_name, quantity )
        `,
        )
        .eq("warehouse_id" as never, options.warehouseId!)
        .gte("created_at", start.toISOString())
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(300);

      if (error) throw error;

      type Raw = {
        id: string;
        order_code: string | null;
        created_at: string;
        warehouse: { code: string; name: string } | null;
        order_items: {
          product_slug: string | null;
          product_name: string;
          quantity: number;
        }[] | null;
      };

      const bySku: Record<string, BranchSkuHistoryEntry> = {};

      for (const order of (data as unknown as Raw[] | null) ?? []) {
        if (options.excludeOrderId && order.id === options.excludeOrderId) continue;
        const cms = toHoChiMinhMillis(order.created_at);
        for (const it of order.order_items || []) {
          if (it.quantity <= 0) continue;
          const mh = it.product_slug || it.product_name;
          const key = normalizeOrderCodeText(mh);
          if (!key) continue;
          const prev = bySku[key];
          if (!prev || cms >= prev.createdAtMs) {
            bySku[key] = {
              maHang: mh,
              maHangKey: key,
              qty: it.quantity,
              soPhieu: order.order_code || order.id.slice(0, 8),
              createdAtMs: cms,
              createdUi: formatOrderTimestampUi(cms),
              dateLabel: toDateKey(new Date(cms)).split("-").reverse().join("/"),
              storeLabel: order.warehouse?.code || order.warehouse?.name || "",
            };
          }
        }
      }

      return {
        bySku,
        skuCount: Object.keys(bySku).length,
        daysBack: days,
      };
    },
  });
}
