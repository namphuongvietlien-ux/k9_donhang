import { supabase } from "@/integrations/supabase/client";

/**
 * Calculate flash sale price for a product
 * @param productId - Product ID
 * @param basePrice - Base price (original_price or price)
 * @returns Flash sale price or base price if no active flash sale
 */
export const calculateFlashSalePrice = async (
  productId: string,
  basePrice: number
): Promise<number> => {
  try {
    const now = new Date().toISOString();
    
    // Try to use the database function first
    const { data, error } = await supabase
      .rpc("get_flash_sale_price", {
        _product_id: productId,
        _base_price: basePrice,
      });

    if (!error && data !== null) {
      return data;
    }

    // Fallback: manual calculation
    const { data: flashSaleData } = await supabase
      .from("flash_sale_products")
      .select(`
        flash_sale_price,
        flash_sales!inner(
          discount_type,
          discount_value,
          is_active,
          starts_at,
          ends_at,
          display_order
        )
      `)
      .eq("product_id", productId)
      .eq("flash_sales.is_active", true)
      .lte("flash_sales.starts_at", now)
      .gt("flash_sales.ends_at", now)
      .order("flash_sales.display_order", { ascending: false })
      .order("flash_sales.created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (flashSaleData) {
      // If custom price is set, use it
      if (flashSaleData.flash_sale_price !== null) {
        return flashSaleData.flash_sale_price;
      }
      
      // Otherwise calculate from discount
      const flashSale = flashSaleData.flash_sales as any;
      if (flashSale.discount_type === "percentage") {
        return basePrice * (1 - flashSale.discount_value / 100);
      } else {
        return Math.max(basePrice - flashSale.discount_value, 0);
      }
    }

    return basePrice;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error("Error calculating flash sale price:", error);
    }
    return basePrice;
  }
};

/**
 * Batch calculate flash sale prices for multiple products
 * @param products - Array of { id, price, original_price }
 * @returns Map of productId -> flashSalePrice
 */
export const calculateFlashSalePrices = async (
  products: Array<{ id: string; price: number; original_price?: number | null }>
): Promise<Map<string, number>> => {
  const priceMap = new Map<string, number>();
  
  // Calculate prices in parallel
  const promises = products.map(async (product) => {
    const basePrice = product.original_price || product.price;
    const flashSalePrice = await calculateFlashSalePrice(product.id, basePrice);
    priceMap.set(product.id, flashSalePrice);
  });

  await Promise.all(promises);
  return priceMap;
};

