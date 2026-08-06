import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CalculateShippingFeeParams {
  weight: number; // kg
  fromProvinceCode: string;
  toProvinceCode: string;
}

export interface ShippingFeeResult {
  fee: number | null;
  error: Error | null;
  isExceededLimit: boolean; // true if weight > 17kg
}

export function useShippingFee(params: CalculateShippingFeeParams | null) {
  return useQuery({
    queryKey: ["shipping-fee", params?.weight, params?.fromProvinceCode, params?.toProvinceCode],
    queryFn: async (): Promise<ShippingFeeResult> => {
      if (!params || params.weight <= 0 || !params.fromProvinceCode || !params.toProvinceCode) {
        return { fee: null, error: null, isExceededLimit: false };
      }

      // Check if weight exceeds 17kg limit
      if (params.weight > 17) {
        return { fee: null, error: null, isExceededLimit: true };
      }

      // Call SQL function to calculate shipping fee
      const { data, error } = await supabase.rpc("calculate_shipping_fee", {
        p_weight: params.weight,
        p_from_province_code: params.fromProvinceCode,
        p_to_province_code: params.toProvinceCode,
      });

      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error("Error calculating shipping fee:", error);
        }
        return { 
          fee: null, 
          error: error as Error, 
          isExceededLimit: false 
        };
      }

      // If returns null, it means weight exceeds 17kg limit or no rate found
      return { 
        fee: data, 
        error: null, 
        isExceededLimit: data === null && params.weight > 17 
      };
    },
    enabled: !!params && params.weight > 0 && !!params.fromProvinceCode && !!params.toProvinceCode,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    retry: 1, // Retry once on error
  });
}

