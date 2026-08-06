import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toDateKey } from "@/lib/packingShifts";

export interface SkuOutboundHistory {
  destination: string;
  quantity: number;
  date: string;
  stockOutCode: string | null;
}

/**
 * Last 7 days outbound history for a product (by slug or id) at a warehouse.
 */
export function useSkuOutboundHistory(
  productSlug: string | null | undefined,
  warehouseId?: string | null,
  enabled = true,
) {
  const [history, setHistory] = useState<SkuOutboundHistory[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !productSlug) {
      setHistory([]);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - 7);
      const sinceKey = toDateKey(since);

      const { data: product } = await supabase
        .from("products")
        .select("id, name, slug")
        .eq("slug", productSlug)
        .maybeSingle();

      if (!product?.id) {
        if (!cancelled) {
          setHistory([]);
          setLoading(false);
        }
        return;
      }

      const { data: outItems } = await supabase
        .from("stock_out_items" as never)
        .select(
          `
          quantity,
          stock_out_id,
          stock_out_transactions:stock_out_id (
            code,
            transaction_date,
            type,
            order_id,
            ecommerce_order_id,
            notes
          )
        `,
        )
        .eq("product_id", product.id)
        .limit(100);

      if (cancelled) return;

      type OutRow = {
        quantity: number;
        stock_out_transactions: {
          code: string | null;
          transaction_date: string;
          type: string;
          order_id: string | null;
          ecommerce_order_id: string | null;
          notes: string | null;
        } | null;
      };

      const rows = ((outItems as OutRow[] | null) ?? []).filter((r) => {
        const tx = r.stock_out_transactions;
        if (!tx || tx.type !== "sale") return false;
        return tx.transaction_date >= sinceKey;
      });

      const orderIds = rows
        .map((r) => r.stock_out_transactions?.order_id)
        .filter((id): id is string => !!id);

      const orderMeta = new Map<string, { province: string | null; warehouse_id: string | null }>();
      if (orderIds.length > 0) {
        const { data: orders } = await supabase
          .from("orders")
          .select("id, shipping_province, warehouse_id")
          .in("id", orderIds);

        for (const o of (orders as { id: string; shipping_province: string | null; warehouse_id: string | null }[] | null) ?? []) {
          orderMeta.set(o.id, { province: o.shipping_province, warehouse_id: o.warehouse_id });
        }
      }

      const result: SkuOutboundHistory[] = [];
      for (const r of rows) {
        const tx = r.stock_out_transactions!;
        const meta = tx.order_id ? orderMeta.get(tx.order_id) : undefined;
        if (warehouseId && meta?.warehouse_id && meta.warehouse_id !== warehouseId) continue;

        const destination =
          meta?.province ||
          tx.notes ||
          (tx.ecommerce_order_id ? "Sàn TMĐT" : "Xuất bán");

        result.push({
          destination,
          quantity: r.quantity,
          date: tx.transaction_date,
          stockOutCode: tx.code,
        });
      }

      // Aggregate by destination
      const agg = new Map<string, SkuOutboundHistory>();
      for (const h of result) {
        const key = h.destination;
        const cur = agg.get(key);
        if (cur) {
          cur.quantity += h.quantity;
          if (h.date > cur.date) cur.date = h.date;
        } else {
          agg.set(key, { ...h });
        }
      }

      if (!cancelled) {
        setHistory(Array.from(agg.values()).sort((a, b) => b.date.localeCompare(a.date)));
        setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [productSlug, warehouseId, enabled]);

  return { history, loading };
}
