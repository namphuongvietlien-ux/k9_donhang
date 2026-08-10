import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export interface Product {
  id: string;
  name: string;
  slug?: string;
  code?: string;
  barcode?: string;
  unit?: string;
  unit_name?: string;
  unit_2?: string | null;
  barcode_2?: string | null;
  price?: number;
  original_price?: number | null;
  image_url?: string | null;
  category?: string | null;
  badge?: string | null;
  has_gift?: boolean;
  is_active?: boolean;
  stock_quantity?: number;
  low_stock_threshold?: number;
  min_stock_level?: number;
  max_stock_level?: number | null;
  cost_price?: number;
  average_cost?: number | null;
  profit_margin?: number | null;
  auto_calculate_profit?: boolean;
  parent_sku?: string | null;
  created_at?: string;
  is_new?: boolean;
  is_out_stock?: boolean;
  is_locked?: boolean;
  [key: string]: any;
}

export function useProducts() {
  const {
    data: products = [],
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ["shared-products-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products" as never)
        .select(`
          id,
          name,
          slug,
          code,
          barcode,
          unit,
          unit_name,
          unit_2,
          barcode_2,
          price,
          original_price,
          image_url,
          category,
          badge,
          has_gift,
          is_active,
          stock_quantity,
          low_stock_threshold,
          min_stock_level,
          max_stock_level,
          cost_price,
          average_cost,
          profit_margin,
          auto_calculate_profit,
          parent_sku,
          created_at,
          is_new,
          is_out_stock,
          is_locked
        `)
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