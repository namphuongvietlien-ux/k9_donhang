/**
 * Utility functions for calculating Shopee platform fees
 * Based on the logic from AdminShopeeFeeCalculator
 * Supports loading config from database via usePlatformFeeConfig hook
 */

export interface ShopeeFeeConfig {
  paymentFeeRate: number; // Phí thanh toán (%)
  fixedFeeRate: number; // Phí cố định (%)
  voucherXtraRate: number; // Phí Voucher Xtra (%)
  infrastructureFee: number; // Phí hạ tầng (VND)
  piShipFee: number; // Phí PiShip (VND)
  vatRate: number; // Thuế GTGT (%)
  pitRate: number; // Thuế TNCN (%)
}

/**
 * Convert database config (key-value pairs) to ShopeeFeeConfig
 * @param dbConfig - Config from database (e.g., { paymentFeeRate: 4.91, ... })
 * @returns ShopeeFeeConfig object
 */
export function convertDbConfigToShopeeConfig(dbConfig: Record<string, number>): Partial<ShopeeFeeConfig> {
  return {
    paymentFeeRate: dbConfig.paymentFeeRate,
    fixedFeeRate: dbConfig.fixedFeeRate,
    voucherXtraRate: dbConfig.voucherXtraRate,
    infrastructureFee: dbConfig.infrastructureFee,
    piShipFee: dbConfig.piShipFee,
    vatRate: dbConfig.vatRate,
    pitRate: dbConfig.pitRate,
  };
}

export interface ShopeeFeeResult {
  totalSales: number; // Tổng doanh số
  shippingFee: number; // Phí vận chuyển
  paymentFee: number; // Phí thanh toán
  fixedFee: number; // Phí cố định
  voucherXtraFee: number; // Phí Voucher Xtra
  piShipFeeAmount: number; // Phí PiShip
  vatFee: number; // Thuế GTGT
  pitFee: number; // Thuế TNCN
  totalFees: number; // Tổng phí
  netRevenue: number; // Doanh thu thuần
  profitMargin: number; // Biên lợi nhuận (%)
}

export const DEFAULT_SHOPEE_FEE_CONFIG: ShopeeFeeConfig = {
  paymentFeeRate: 4.91,
  fixedFeeRate: 11.29,
  voucherXtraRate: 3,
  infrastructureFee: 3000,
  piShipFee: 1620,
  vatRate: 1,
  pitRate: 0.5,
};

/**
 * Calculate Shopee fees for an order
 */
export function calculateShopeeFees(
  totalSales: number,
  shippingFee: number = 0,
  config: Partial<ShopeeFeeConfig> = {}
): ShopeeFeeResult {
  const feeConfig = { ...DEFAULT_SHOPEE_FEE_CONFIG, ...config };
  const totalOrderValue = totalSales + shippingFee;

  // 1. Phí thanh toán (4.91%)
  const paymentFee = Math.round(totalOrderValue * (feeConfig.paymentFeeRate / 100));

  // 2. Phí cố định (11.29%)
  const fixedFee = Math.round(totalSales * (feeConfig.fixedFeeRate / 100));

  // 3. Phí Voucher Xtra (3%) - có giới hạn 20,000đ/sản phẩm
  let voucherXtraFee = Math.round(totalSales * (feeConfig.voucherXtraRate / 100));
  const vxCap = 20000;
  // Giả sử quantity = 1 để tính, nếu cần chính xác hơn thì truyền quantity vào
  if (voucherXtraFee > vxCap) voucherXtraFee = vxCap;

  // 4. Thuế
  const vatFee = Math.round(totalSales * (feeConfig.vatRate / 100));
  const pitFee = Math.round(totalSales * (feeConfig.pitRate / 100));

  // Tổng hợp phí
  const totalFees =
    paymentFee +
    fixedFee +
    voucherXtraFee +
    feeConfig.infrastructureFee +
    feeConfig.piShipFee +
    vatFee +
    pitFee;

  const netRevenue = totalSales - totalFees;
  const profitMargin = totalSales > 0 ? (netRevenue / totalSales) * 100 : 0;

  return {
    totalSales,
    shippingFee,
    paymentFee,
    fixedFee,
    voucherXtraFee,
    piShipFeeAmount: feeConfig.piShipFee,
    vatFee,
    pitFee,
    totalFees,
    netRevenue,
    profitMargin,
  };
}

/**
 * Calculate Shopee fees with quantity (for more accurate Voucher Xtra calculation)
 */
export function calculateShopeeFeesWithQuantity(
  totalSales: number,
  quantity: number,
  shippingFee: number = 0,
  config: Partial<ShopeeFeeConfig> = {}
): ShopeeFeeResult {
  const feeConfig = { ...DEFAULT_SHOPEE_FEE_CONFIG, ...config };
  const totalOrderValue = totalSales + shippingFee;

  // 1. Phí thanh toán (4.91%)
  const paymentFee = Math.round(totalOrderValue * (feeConfig.paymentFeeRate / 100));

  // 2. Phí cố định (11.29%)
  const fixedFee = Math.round(totalSales * (feeConfig.fixedFeeRate / 100));

  // 3. Phí Voucher Xtra (3%) - có giới hạn 20,000đ/sản phẩm
  let voucherXtraFee = Math.round(totalSales * (feeConfig.voucherXtraRate / 100));
  const vxCap = 20000;
  if (voucherXtraFee > vxCap * quantity) voucherXtraFee = vxCap * quantity;

  // 4. Thuế
  const vatFee = Math.round(totalSales * (feeConfig.vatRate / 100));
  const pitFee = Math.round(totalSales * (feeConfig.pitRate / 100));

  // Tổng hợp phí
  const totalFees =
    paymentFee +
    fixedFee +
    voucherXtraFee +
    feeConfig.infrastructureFee +
    feeConfig.piShipFee +
    vatFee +
    pitFee;

  const netRevenue = totalSales - totalFees;
  const profitMargin = totalSales > 0 ? (netRevenue / totalSales) * 100 : 0;

  return {
    totalSales,
    shippingFee,
    paymentFee,
    fixedFee,
    voucherXtraFee,
    piShipFeeAmount: feeConfig.piShipFee,
    vatFee,
    pitFee,
    totalFees,
    netRevenue,
    profitMargin,
  };
}

