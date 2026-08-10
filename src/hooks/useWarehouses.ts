import { supabase } from "@/integrations/supabase/client";
import { enrichWarehouseMeta } from "@/lib/warehouseMeta";
import { useQuery } from "@tanstack/react-query";

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

/** Nhãn cột / in: Q4 Cũ, Q4 Mới… (không bao giờ hiện Q4_178 / Q4_275). */
export function warehouseLabel(
  w: Pick<Warehouse, "code" | "short_name" | "print_name" | "name">,
): string {
  const enriched = enrichWarehouseMeta(w);
  const label =
    String(enriched?.short_name || "").trim() ||
    String(enriched?.print_name || "").trim() ||
    w.code;
  if (label === "Q4_178") return "Q4 Cũ";
  if (label === "Q4_275") return "Q4 Mới";
  return label;
}

export function useWarehouses() {
  const { 
    data: warehouses = [], 
    isLoading: loading, 
    error: queryError, 
    refetch 
  } = useQuery({
    queryKey: ["warehouses-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses" as never)
        .select("id, code, name, is_active, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      
      if (error) throw error;
      return (data || []) as Warehouse[];
    },
    staleTime: 1000 * 60 * 5, // Cache 5 phút, chống spam API tuyệt đối!
  });

  return {
    warehouses,
    loading,
    error: queryError ? (queryError as Error).message : null,
    refreshWarehouses: refetch, // Giữ nguyên tên hàm để không vỡ UI cũ
  };
}