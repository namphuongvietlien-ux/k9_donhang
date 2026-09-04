import { useMemo } from "react";
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
  /** 1 unit_2 = unit_2_ratio × unit (KiotViet "Tỷ lệ quy đổi") */
  unit_2_ratio?: number | null;
  /** Giá bán riêng của unit_2 — không suy ra từ price × tỷ lệ */
  price_2?: number | null;
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
  /** THUOC (gồm VT y tế) | HANG_HOA | DICH_VU */
  category_group?: string | null;
  /** 2 ký tự ngành từ SKU 10 ký tự (TA/VS/YT…) */
  sku_industry?: string | null;
  /** 2 ký tự chi tiết từ SKU 10 ký tự (HA/PA/TH…) */
  sku_detail?: string | null;
  [key: string]: any;
}

export function useProducts() {
  const {
    data,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ["shared-products-list", "sku-groups"],
    queryFn: async () => {
      let allData: any[] = [];
      let from = 0;
      const step = 1000;
      let fetchMore = true;
      const baseSelect = `
            id,
            name,
            slug,
            barcode,
            unit,
            unit_name,
            unit_2,
            barcode_2,
            unit_2_ratio,
            price_2,
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
            is_locked,
            category_group`;
      let select = `${baseSelect},
            sku_industry,
            sku_detail
          `;

      // Vòng lặp tải dữ liệu cuốn chiếu để vượt qua giới hạn 1000 dòng của Supabase
      while (fetchMore) {
        const { data, error } = await supabase
          .from("products" as never)
          .select(select)
          // Bắt buộc có khóa phụ DUY NHẤT (id): `name` bị trùng ở ~2.7k dòng,
          // phân trang theo cột không duy nhất làm Postgres trả thứ tự khác nhau
          // giữa các trang → mất dòng ở ranh giới trang (VD mất hẳn TAC1073,
          // khiến quét mã vạch 8850477016996 ra nhầm SKU khác).
          .order("name", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + step - 1);

        if (error) {
          if (
            /sku_industry|sku_detail/i.test(error.message || "") &&
            select.includes("sku_industry")
          ) {
            select = `${baseSelect}
          `;
            allData = [];
            from = 0;
            fetchMore = true;
            continue;
          }
          console.error("Error fetching products:", error);
          throw error;
        }

        // Nếu có dữ liệu trả về, gộp vào mảng tổng và tăng dải fetch (offset)
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          from += step;
        }

        // Nếu lượng dữ liệu trả về ít hơn step (1000), nghĩa là đã tải hết kho
        if (!data || data.length < step) {
          fetchMore = false;
        }
      }

      return allData as Product[];
    },
    staleTime: 1000 * 60 * 5, // Cache 5 phút
    gcTime: 1000 * 60 * 10, // Giữ cache rác trong 10 phút
    refetchOnWindowFocus: false, // Tránh tự động gọi API ngầm khi bấm qua lại giữa các tab
  });

  const products = useMemo(
    () => (Array.isArray(data) ? (data as Product[]) : []) as Product[],
    [data],
  );

  return {
    products,
    loading,
    error: queryError ? (queryError as Error).message : null,
    refreshProducts: refetch,
  };
}