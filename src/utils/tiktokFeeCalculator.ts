/**
 * Utility functions for calculating TikTok platform fees
 * Based on the logic from AdminTikTokFeeCalculator
 * Supports loading config from database via usePlatformFeeConfig hook
 */

export interface TikTokFeeConfig {
  transactionFeeRate: number; // Phí giao dịch (%)
  commissionRate: number; // Hoa hồng sàn (%)
  affiliateRate: number; // Hoa hồng Affiliate (%)
  voucherXtraRate: number; // Phí Voucher Xtra (%)
  processingFee: number; // Phí xử lý đơn (VND)
  sfrRate: number; // Phí SFR (%)
  vatRate: number; // Thuế GTGT (%)
  pitRate: number; // Thuế TNCN (%)
}

/**
 * Convert database config (key-value pairs) to TikTokFeeConfig
 * @param dbConfig - Config from database (e.g., { transactionFeeRate: 5.0, ... })
 * @returns TikTokFeeConfig object
 */
export function convertDbConfigToTikTokConfig(dbConfig: Record<string, number>): Partial<TikTokFeeConfig> {
  return {
    transactionFeeRate: dbConfig.transactionFeeRate,
    commissionRate: dbConfig.commissionRate,
    affiliateRate: dbConfig.affiliateRate,
    voucherXtraRate: dbConfig.voucherXtraRate,
    processingFee: dbConfig.processingFee,
    sfrRate: dbConfig.sfrRate,
    vatRate: dbConfig.vatRate,
    pitRate: dbConfig.pitRate,
  };
}

export interface TikTokFeeResult {
  totalSales: number; // Tổng doanh số
  shippingFee: number; // Phí vận chuyển (ship khách trả)
  transactionFee: number; // Phí giao dịch
  commissionFee: number; // Hoa hồng sàn
  affiliateFee: number; // Hoa hồng Affiliate
  voucherXtraFee: number; // Phí Voucher Xtra
  processingFeeAmount: number; // Phí xử lý đơn
  sfrFee: number; // Phí SFR
  vatFee: number; // Thuế GTGT
  pitFee: number; // Thuế TNCN
  totalFees: number; // Tổng phí
  netRevenue: number; // Doanh thu thuần
  profitMargin: number; // Biên lợi nhuận (%)
  retention: string; // Retention rate (%)
}

export const DEFAULT_TIKTOK_FEE_CONFIG: TikTokFeeConfig = {
  transactionFeeRate: 5,
  commissionRate: 11.29,
  affiliateRate: 15,
  voucherXtraRate: 3,
  processingFee: 3000,
  sfrRate: 1.57,
  vatRate: 1,
  pitRate: 0.5,
};

/**
 * Calculate TikTok fees for an order
 */
export function calculateTikTokFees(
  totalSales: number,
  shippingFee: number = 0,
  config: Partial<TikTokFeeConfig> = {}
): TikTokFeeResult {
  const feeConfig = { ...DEFAULT_TIKTOK_FEE_CONFIG, ...config };
  const totalOrderValue = totalSales + shippingFee;

  // 1. Phí giao dịch: 5% trên (tổng giá bán + ship khách trả)
  const transactionFee = Math.round(totalOrderValue * (feeConfig.transactionFeeRate / 100));

  // 2. Hoa hồng sàn
  const commissionFee = Math.round(totalSales * (feeConfig.commissionRate / 100));

  // 3. Hoa hồng Affiliate
  const affiliateFee = Math.round(totalSales * (feeConfig.affiliateRate / 100));

  // 4. Phí Voucher Xtra (3%)
  const voucherXtraFee = Math.round(totalSales * (feeConfig.voucherXtraRate / 100));

  // 5. Phí SFR
  const sfrFee = Math.round(totalSales * (feeConfig.sfrRate / 100));

  // 6. Thuế
  const vatFee = Math.round(totalSales * (feeConfig.vatRate / 100));
  const pitFee = Math.round(totalSales * (feeConfig.pitRate / 100));

  // Tổng hợp phí
  const totalFees =
    transactionFee +
    commissionFee +
    affiliateFee +
    voucherXtraFee +
    feeConfig.processingFee +
    sfrFee +
    vatFee +
    pitFee;

  const netRevenue = totalSales - totalFees;
  const profitMargin = totalSales > 0 ? (netRevenue / totalSales) * 100 : 0;
  const retention = totalSales > 0 ? ((netRevenue / totalSales) * 100).toFixed(1) : '0.0';

  return {
    totalSales,
    shippingFee,
    transactionFee,
    commissionFee,
    affiliateFee,
    voucherXtraFee,
    processingFeeAmount: feeConfig.processingFee,
    sfrFee,
    vatFee,
    pitFee,
    totalFees,
    netRevenue,
    profitMargin,
    retention,
  };
}

/**
 * Calculate TikTok fees with quantity (for orders with multiple items)
 * Note: TikTok fees are calculated per order, not per item, so quantity is mainly for reference
 */
export function calculateTikTokFeesWithQuantity(
  totalSales: number,
  quantity: number,
  shippingFee: number = 0,
  config: Partial<TikTokFeeConfig> = {}
): TikTokFeeResult {
  // TikTok fees are calculated on total order value, not per item
  // So we can use the same calculation as calculateTikTokFees
  return calculateTikTokFees(totalSales, shippingFee, config);
}

