/**
 * TikTok Category and Commission Data
 * Based on TikTok Shop commission structure
 */

export interface TikTokCategory {
  cluster: string; // Ngành hàng (Cluster)
  marketplaceCommissionMin: number; // Marketplace Commission min (%)
  marketplaceCommissionMax: number; // Marketplace Commission max (%)
  mallCommissionMin: number; // Mall Commission min (%)
  mallCommissionMax: number; // Mall Commission max (%)
}

export interface TikTokCategoryOption {
  value: string;
  label: string;
  cluster: string;
  marketplaceCommissionMin: number;
  marketplaceCommissionMax: number;
  mallCommissionMin: number;
  mallCommissionMax: number;
  // Default commission rates (using max values as default)
  defaultMarketplaceCommission: number;
  defaultMallCommission: number;
}

// TikTok Categories Data
const tiktokCategoriesData: TikTokCategory[] = [
  {
    cluster: "Electronics",
    marketplaceCommissionMin: 1.47,
    marketplaceCommissionMax: 10.80,
    mallCommissionMin: 2.00,
    mallCommissionMax: 12.60,
  },
  {
    cluster: "Fashion",
    marketplaceCommissionMin: 10.80,
    marketplaceCommissionMax: 11.78,
    mallCommissionMin: 8.50,
    mallCommissionMax: 14.50,
  },
  {
    cluster: "Grocery, Health & Beauty, Mother & Baby",
    marketplaceCommissionMin: 6.87,
    marketplaceCommissionMax: 11.78,
    mallCommissionMin: 10.50,
    mallCommissionMax: 15.80,
  },
  {
    cluster: "Home & Living",
    marketplaceCommissionMin: 3.93,
    marketplaceCommissionMax: 11.78,
    mallCommissionMin: 1.50,
    mallCommissionMax: 14.50,
  },
];

/**
 * Convert TikTok categories to searchable options
 */
export function getTikTokCategoryOptions(): TikTokCategoryOption[] {
  return tiktokCategoriesData.map((cat) => {
    return {
      value: cat.cluster.toLowerCase().replace(/\s+/g, "-"),
      label: `${cat.cluster} (Marketplace: ${cat.marketplaceCommissionMin}% - ${cat.marketplaceCommissionMax}%, Mall: ${cat.mallCommissionMin}% - ${cat.mallCommissionMax}%)`,
      cluster: cat.cluster,
      marketplaceCommissionMin: cat.marketplaceCommissionMin,
      marketplaceCommissionMax: cat.marketplaceCommissionMax,
      mallCommissionMin: cat.mallCommissionMin,
      mallCommissionMax: cat.mallCommissionMax,
      // Use max values as default (most conservative)
      defaultMarketplaceCommission: cat.marketplaceCommissionMax,
      defaultMallCommission: cat.mallCommissionMax,
    };
  });
}

/**
 * Search TikTok categories by keyword
 */
export function searchTikTokCategories(keyword: string): TikTokCategoryOption[] {
  const options = getTikTokCategoryOptions();
  
  if (!keyword.trim()) {
    return options;
  }
  
  const lowerKeyword = keyword.toLowerCase();
  
  return options.filter((option) => {
    const searchText = option.cluster.toLowerCase();
    return searchText.includes(lowerKeyword);
  });
}

