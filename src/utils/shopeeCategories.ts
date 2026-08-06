/**
 * Shopee Category and Fixed Fee Data
 * Loaded from Phi co dinh tu 29.json
 */

export interface ShopeeCategory {
  STT: number;
  "Ngành hàng cấp 1": string;
  "Ngành hàng cấp 2": string;
  "Ngành hàng cấp 3": string;
  "Phí cố định": string; // e.g., "10.00%"
}

export interface CategoryOption {
  value: string;
  label: string;
  fullPath: string;
  fixedFeeRate: number;
  category: ShopeeCategory;
}

// Lazy load categories data
let categoriesData: ShopeeCategory[] | null = null;

export async function loadCategories(): Promise<ShopeeCategory[]> {
  if (categoriesData) {
    return categoriesData;
  }

  try {
    const response = await fetch('/shopee-categories.json');
    if (!response.ok) {
      throw new Error('Failed to load categories data');
    }
    categoriesData = await response.json();
    return categoriesData;
  } catch (error) {
    console.error('Error loading categories:', error);
    // Return empty array if file not found
    return [];
  }
}

/**
 * Parse fixed fee rate from string like "10.00%" to number 10.00
 */
function parseFixedFeeRate(feeString: string): number {
  const match = feeString.match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Convert categories to searchable options
 */
export async function getCategoryOptions(): Promise<CategoryOption[]> {
  const categories = await loadCategories();
  
  return categories.map((cat) => {
    const level1 = cat["Ngành hàng cấp 1"] || "";
    const level2 = cat["Ngành hàng cấp 2"] || "";
    const level3 = cat["Ngành hàng cấp 3"] || "";
    
    // Build full path for display
    const parts = [level1, level2, level3].filter(Boolean);
    const fullPath = parts.join(" > ");
    
    // Build searchable label
    const label = level3 
      ? `${level1} > ${level2} > ${level3} (${cat["Phí cố định"]})`
      : level2
      ? `${level1} > ${level2} (${cat["Phí cố định"]})`
      : `${level1} (${cat["Phí cố định"]})`;
    
    return {
      value: `${cat.STT}`,
      label,
      fullPath,
      fixedFeeRate: parseFixedFeeRate(cat["Phí cố định"]),
      category: cat,
    };
  });
}

/**
 * Search categories by keyword
 */
export async function searchCategories(keyword: string): Promise<CategoryOption[]> {
  const options = await getCategoryOptions();
  
  if (!keyword.trim()) {
    return options.slice(0, 50); // Return first 50 if no search
  }
  
  const lowerKeyword = keyword.toLowerCase();
  
  return options.filter((option) => {
    const searchText = option.fullPath.toLowerCase();
    return searchText.includes(lowerKeyword);
  }).slice(0, 100); // Limit to 100 results
}

/**
 * Get category by STT
 */
export async function getCategoryBySTT(stt: number): Promise<CategoryOption | null> {
  const options = await getCategoryOptions();
  return options.find((opt) => opt.value === `${stt}`) || null;
}

