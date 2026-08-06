import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlatformFeeConfig {
  [feeKey: string]: number;
}

/**
 * Hook to load platform fee configuration from database
 * @param platformCode - Platform code: 'shopee', 'tiktok', 'ghn', etc.
 * @returns Fee configuration object with fee_key as keys and fee_value as values
 */
export function usePlatformFeeConfig(platformCode: string) {
  return useQuery({
    queryKey: ["platform-fee-config", platformCode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_fee_configs")
        .select("fee_key, fee_value")
        .eq("platform_code", platformCode)
        .eq("is_active", true);

      if (error) throw error;

      // Convert array to object for easy access
      const config: PlatformFeeConfig = {};
      (data || []).forEach((item) => {
        config[item.fee_key] = Number(item.fee_value);
      });

      return config;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });
}

/**
 * Get default fee config if database config is not available
 * Falls back to hardcoded defaults
 */
export function getDefaultFeeConfig(platformCode: string): PlatformFeeConfig {
  if (platformCode === "shopee") {
    return {
      paymentFeeRate: 4.91,
      fixedFeeRate: 11.29,
      voucherXtraRate: 3.0,
      infrastructureFee: 3000,
      piShipFee: 1620,
      vatRate: 1.0,
      pitRate: 0.5,
    };
  }

  if (platformCode === "tiktok") {
    return {
      transactionFeeRate: 5.0,
      commissionRate: 11.29,
      affiliateRate: 15.0,
      voucherXtraRate: 3.0,
      processingFee: 3000,
      sfrRate: 1.57,
      vatRate: 1.0,
      pitRate: 0.5,
    };
  }

  return {};
}

