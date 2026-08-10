import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FlashSale {
  id: string;
  title: string;
  description: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  display_order: number;
  banner_image_url: string | null;
  products?: Array<{
    id: string;
    product_id: string;
    flash_sale_price: number | null;
    max_quantity: number | null;
    price_mask_enabled: boolean;
    price_mask_hide_first_digits: number;
    product: {
      id: string;
      name: string;
      slug: string;
      price: number;
      original_price: number | null;
      image_url: string | null;
      stock_quantity: number;
    };
  }>;
}

export const useActiveFlashSales = () => {
  return useQuery({
    queryKey: ["active-flash-sales"],
    queryFn: async () => {
      const now = new Date().toISOString();
      
      const { data, error } = await supabase
        .from("flash_sales")
        .select(`
          *,
          products:flash_sale_products(
            id,
            product_id,
            flash_sale_price,
            max_quantity,
            price_mask_enabled,
            price_mask_hide_first_digits,
            product:products!inner(
              id,
              name,
              slug,
              price,
              original_price,
              image_url,
              stock_quantity,
              is_active
            )
          )
        `)
        .eq("is_active", true)
        .lte("starts_at", now)
        .gt("ends_at", now)
        .order("display_order", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Filter out products that are not active
      const filteredData = (data || []).map((fs: any) => ({
        ...fs,
        products: fs.products?.filter((p: any) => p.product?.is_active === true) || [],
      }));

      return filteredData as FlashSale[];
    },
    staleTime: 30 * 1000, // 30 seconds - flash sales change frequently
    // Keep data cached without periodic background polling.
    placeholderData: [],
    // Don't block initial render - fetch in background
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

/**
 * Hook to get upcoming flash sales (sắp diễn ra)
 * Returns flash sales that haven't started yet but are scheduled to start soon
 */
export const useUpcomingFlashSales = () => {
  return useQuery({
    queryKey: ["upcoming-flash-sales"],
    queryFn: async () => {
      const now = new Date().toISOString();
      
      const { data, error } = await supabase
        .from("flash_sales")
        .select(`
          *,
          products:flash_sale_products(
            id,
            product_id,
            flash_sale_price,
            max_quantity,
            price_mask_enabled,
            price_mask_hide_first_digits,
            product:products!inner(
              id,
              name,
              slug,
              price,
              original_price,
              image_url,
              stock_quantity,
              is_active
            )
          )
        `)
        .eq("is_active", true)
        .gt("starts_at", now)
        .order("starts_at", { ascending: true }) // Sort by start time, earliest first
        .order("display_order", { ascending: false })
        .limit(1); // Only get the next upcoming flash sale

      if (error) throw error;

      // Filter out products that are not active
      const filteredData = (data || []).map((fs: any) => ({
        ...fs,
        products: fs.products?.filter((p: any) => p.product?.is_active === true) || [],
      }));

      return filteredData as FlashSale[];
    },
    staleTime: 30 * 1000,
    placeholderData: [],
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useFlashSalePrice = (productId: string, basePrice: number) => {
  return useQuery({
    queryKey: ["flash-sale-price", productId, basePrice],
    queryFn: async () => {
      const now = new Date().toISOString();
      
      const { data, error } = await supabase
        .rpc("get_flash_sale_price", {
          _product_id: productId,
          _base_price: basePrice,
        });

      if (error) {
        // If function doesn't exist yet, fallback to manual calculation
        const { data: flashSaleData } = await supabase
          .from("flash_sale_products")
          .select(`
            flash_sale_price,
            flash_sales!inner(
              discount_type,
              discount_value,
              is_active,
              starts_at,
              ends_at
            )
          `)
          .eq("product_id", productId)
          .eq("flash_sales.is_active", true)
          .lte("flash_sales.starts_at", now)
          .gt("flash_sales.ends_at", now)
          .order("flash_sales.display_order", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (flashSaleData) {
          if (flashSaleData.flash_sale_price !== null) {
            return flashSaleData.flash_sale_price;
          }
          const flashSale = flashSaleData.flash_sales as any;
          if (flashSale.discount_type === "percentage") {
            return basePrice * (1 - flashSale.discount_value / 100);
          } else {
            return Math.max(basePrice - flashSale.discount_value, 0);
          }
        }
        // No flash sale found - return null so displayPrice uses product.price
        return null;
      }

      // If SQL function returns basePrice, it means no flash sale was found
      // Return null instead so displayPrice uses product.price
      if (data === basePrice || data === null) {
        return null;
      }
      return data;
    },
    staleTime: 30 * 1000,
    enabled: !!productId && basePrice > 0,
  });
};

