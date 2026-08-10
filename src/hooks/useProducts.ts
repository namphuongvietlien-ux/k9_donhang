import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export interface Product {
  id: string;
  name: string;
  code?: string;
  barcode?: string;
  unit?: string;
  price?: number;
  [key: string]: any;
}

export function useProducts() {
  const { 
    data: products = [], 
    isLoading: loading, 
    error: queryError, 
    refetch 
  } = useQuery({
    queryKey: ["shared-products-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products" as never)
        .select("id, name, code, barcode, unit, price, is_active")
        .order("name", { ascending: true });
      
      if (error) throw error;
      return (data || []) as Product[];
    },
    staleTime: 1000 * 60 * 5, // Cache 5 phút, gom toàn bộ request sản phẩm vào một mối!
  });

  return {
    products,
    loading,
    error: queryError ? (queryError as Error).message : null,
    refreshProducts: refetch,
  };
}