import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DuplicateMatch {
  orderId: string;
  orderCode: string | null;
  customerName: string;
  totalQty: number;
  productSlugs: string[];
  createdAt: string;
  warehouseId: string | null;
  reason: "same_total_qty" | "similar_skus" | "both";
}

export interface DuplicateAlert {
  order: {
    id: string;
    order_code: string | null;
    customer_name: string;
    warehouse_id: string | null;
    created_at: string;
    status: string;
    duplicate_accepted: boolean;
  };
  matches: DuplicateMatch[];
}

interface OrderRow {
  id: string;
  order_code: string | null;
  customer_name: string;
  warehouse_id: string | null;
  created_at: string;
  status: string;
  duplicate_accepted: boolean | null;
}

interface OrderItemRow {
  order_id: string;
  product_slug: string | null;
  quantity: number;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  a.forEach((x) => {
    if (b.has(x)) inter += 1;
  });
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Detect duplicate orders: same warehouse, within 60 minutes,
 * same total qty OR similar product slugs (≥50% overlap).
 */
export function useDuplicateOrders(options?: {
  warehouseId?: string | null;
  enabled?: boolean;
  pollMs?: number;
}) {
  const enabled = options?.enabled ?? true;
  const pollMs = options?.pollMs ?? 0;
  const [alerts, setAlerts] = useState<DuplicateAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const detect = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from("orders")
      .select("id, order_code, customer_name, warehouse_id, created_at, status, duplicate_accepted")
      .neq("status", "cancelled")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);

    if (options?.warehouseId) {
      query = query.eq("warehouse_id" as never, options.warehouseId);
    }

    const { data: orders, error } = await query;
    if (error || !orders) {
      setAlerts([]);
      setLoading(false);
      return;
    }

    const typedOrders = orders as unknown as OrderRow[];
    const ids = typedOrders.map((o) => o.id);
    if (ids.length === 0) {
      setAlerts([]);
      setLoading(false);
      return;
    }

    const { data: items } = await supabase
      .from("order_items")
      .select("order_id, product_slug, quantity")
      .in("order_id", ids);

    const itemRows = (items as OrderItemRow[] | null) ?? [];
    const byOrder = new Map<string, { totalQty: number; slugs: Set<string> }>();
    for (const row of itemRows) {
      const cur = byOrder.get(row.order_id) ?? { totalQty: 0, slugs: new Set<string>() };
      cur.totalQty += row.quantity;
      if (row.product_slug) cur.slugs.add(row.product_slug);
      byOrder.set(row.order_id, cur);
    }

    const WINDOW_MS = 60 * 60 * 1000;
    const found: DuplicateAlert[] = [];

    for (let i = 0; i < typedOrders.length; i++) {
      const a = typedOrders[i];
      if (a.duplicate_accepted) continue;
      const aMeta = byOrder.get(a.id) ?? { totalQty: 0, slugs: new Set<string>() };
      const matches: DuplicateMatch[] = [];

      for (let j = i + 1; j < typedOrders.length; j++) {
        const b = typedOrders[j];
        if (a.warehouse_id !== b.warehouse_id) continue;
        if (!a.warehouse_id && !b.warehouse_id) continue;

        const dt = Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        if (dt > WINDOW_MS) continue;

        const bMeta = byOrder.get(b.id) ?? { totalQty: 0, slugs: new Set<string>() };
        const sameQty = aMeta.totalQty > 0 && aMeta.totalQty === bMeta.totalQty;
        const similarSkus = jaccard(aMeta.slugs, bMeta.slugs) >= 0.5 && aMeta.slugs.size > 0;

        if (!sameQty && !similarSkus) continue;

        matches.push({
          orderId: b.id,
          orderCode: b.order_code,
          customerName: b.customer_name,
          totalQty: bMeta.totalQty,
          productSlugs: Array.from(bMeta.slugs),
          createdAt: b.created_at,
          warehouseId: b.warehouse_id,
          reason: sameQty && similarSkus ? "both" : sameQty ? "same_total_qty" : "similar_skus",
        });
      }

      if (matches.length > 0) {
        found.push({
          order: {
            id: a.id,
            order_code: a.order_code,
            customer_name: a.customer_name,
            warehouse_id: a.warehouse_id,
            created_at: a.created_at,
            status: a.status,
            duplicate_accepted: !!a.duplicate_accepted,
          },
          matches,
        });
      }
    }

    setAlerts(found);
    setLoading(false);
  }, [enabled, options?.warehouseId]);

  useEffect(() => {
    void detect();
    if (!enabled || !pollMs || pollMs <= 0) return;
    const t = window.setInterval(() => {
      void detect();
    }, pollMs);
    return () => window.clearInterval(t);
  }, [detect, enabled, pollMs]);

  const acceptDuplicate = useCallback(
    async (orderId: string) => {
      const { error } = await supabase
        .from("orders")
        .update({ duplicate_accepted: true } as never)
        .eq("id", orderId);
      if (!error) await detect();
      return { error };
    },
    [detect],
  );

  const cancelOrder = useCallback(
    async (orderId: string) => {
      const { error } = await supabase
        .from("orders")
        .update({ status: "cancelled" } as never)
        .eq("id", orderId);
      if (!error) await detect();
      return { error };
    },
    [detect],
  );

  return { alerts, loading, refetch: detect, acceptDuplicate, cancelOrder };
}
