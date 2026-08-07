import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { enrichWarehouseMeta } from "@/lib/warehouseMeta";

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  address?: string | null;
  short_name?: string | null;
  print_name?: string | null;
}

/** Nhãn cột / in: Q4 Cũ, Q4 Mới… (không dùng Q4_178 / Q4_275). */
export function warehouseLabel(
  w: Pick<Warehouse, "code" | "short_name" | "print_name" | "name">,
): string {
  const enriched = enrichWarehouseMeta(w);
  return (
    String(enriched?.short_name || "").trim() ||
    String(enriched?.print_name || "").trim() ||
    w.code
  );
}

export function useWarehouses() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWarehouses = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Select cơ bản trước — tránh 400 khi chưa có cột address
    const basic = await supabase
      .from("warehouses" as never)
      .select("id, code, name, is_active, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (basic.error) {
      setError(basic.error.message || "Lỗi tải kho");
      setWarehouses([]);
      setLoading(false);
      return;
    }

    let rows = (basic.data as Warehouse[] | null) ?? [];

    // Thử enrich từ DB nếu đã migration
    const full = await supabase
      .from("warehouses" as never)
      .select("id, code, address, short_name, print_name")
      .eq("is_active", true);
    if (!full.error && full.data) {
      const byId = new Map(
        (
          full.data as {
            id: string;
            address?: string | null;
            short_name?: string | null;
            print_name?: string | null;
          }[]
        ).map((w) => [w.id, w]),
      );
      rows = rows.map((w) => {
        const extra = byId.get(w.id);
        return enrichWarehouseMeta({
          ...w,
          address: extra?.address ?? null,
          short_name: extra?.short_name ?? null,
          print_name: extra?.print_name ?? null,
        })!;
      });
    } else {
      rows = rows.map((w) => enrichWarehouseMeta(w)!);
    }

    setWarehouses(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchWarehouses();
  }, [fetchWarehouses]);

  return { warehouses, loading, error, refetch: fetchWarehouses };
}
