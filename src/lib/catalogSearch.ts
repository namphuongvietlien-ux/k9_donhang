export interface CatalogSearchItem {
  id: string;
  name: string;
  slug: string;
  barcode: string | null;
  barcode_2?: string | null;
  unit: string | null;
  unit_2?: string | null;
  unit_2_ratio?: number | null;
  price?: number;
  parent_sku?: string | null;
  is_new?: boolean;
  is_locked?: boolean;
  is_out_stock?: boolean;
}

// 1. Hàm tính điểm để sắp xếp ưu tiên tìm kiếm
export function scoreCatalogItem(item: CatalogSearchItem, query: string): number {
  const q = (query || "").trim().toLowerCase();
  if (!q) return 0;
  
  let score = 0;
  const bc = (item.barcode || "").trim().toLowerCase();
  const bc2 = (item.barcode_2 || "").trim().toLowerCase();
  const slug = (item.slug || "").trim().toLowerCase();
  const name = (item.name || "").trim().toLowerCase();

  if (bc === q || bc2 === q || slug === q) score += 100;
  else if (/^\d{6}$/.test(q) && (bc.endsWith(q) || bc2.endsWith(q))) score += 50;
  else if (name.includes(q)) score += 20;
  else if (slug.includes(q)) score += 10;

  return score;
}

// 2. Hàm lọc danh sách Dropdown (Gợi ý khi đang gõ)
export function filterCatalogSuggestions(
  items: CatalogSearchItem[],
  query: string,
  limit: number = 12
): CatalogSearchItem[] {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];

  // TÌM KHỚP TUYỆT ĐỐI (Gọt khoảng trắng bằng .trim())
  const exactMatches = items.filter((p) => {
    const bc = (p.barcode || "").trim().toLowerCase();
    const bc2 = (p.barcode_2 || "").trim().toLowerCase();
    const slug = (p.slug || "").trim().toLowerCase();
    
    return bc === q || bc2 === q || slug === q;
  });

  if (exactMatches.length > 0) {
    // Ưu tiên mã SKU dài hơn (mã mới) lên trên cùng
    exactMatches.sort((a, b) => (b.slug || "").length - (a.slug || "").length);
    return exactMatches.slice(0, limit);
  }

  // TÌM THEO 6 SỐ HOẶC TƯƠNG ĐỐI
  const is6Digits = /^\d{6}$/.test(q);

  const results = items.filter((p) => {
    const bc = (p.barcode || "").trim().toLowerCase();
    const bc2 = (p.barcode_2 || "").trim().toLowerCase();
    const slug = (p.slug || "").trim().toLowerCase();
    const name = (p.name || "").trim().toLowerCase();

    if (is6Digits) {
      return (
        bc.endsWith(q) ||
        bc2.endsWith(q) ||
        slug.includes(q) ||
        name.includes(q)
      );
    }

    return (
      bc.includes(q) ||
      bc2.includes(q) ||
      slug.includes(q) ||
      name.includes(q)
    );
  });

  results.sort((a, b) => {
    const scoreA = scoreCatalogItem(a, query);
    const scoreB = scoreCatalogItem(b, query);
    if (scoreA === scoreB) {
      return (b.slug || "").length - (a.slug || "").length;
    }
    return scoreB - scoreA;
  });

  return results.slice(0, limit);
}

// 3. Hàm chốt sản phẩm (Khi bấm Enter)
export function resolveCatalogScan(
  items: CatalogSearchItem[],
  query: string
): { hit: CatalogSearchItem | null; ambiguous: boolean; skus: string[] } {
  const q = (query || "").trim().toLowerCase();
  if (!q) return { hit: null, ambiguous: false, skus: [] };

  const is6Digits = /^\d{6}$/.test(q);

  const matches = items.filter((p) => {
    const bc = (p.barcode || "").trim().toLowerCase();
    const bc2 = (p.barcode_2 || "").trim().toLowerCase();
    const slug = (p.slug || "").trim().toLowerCase();

    if (is6Digits) {
      return bc.endsWith(q) || bc2.endsWith(q) || slug === q;
    }

    return bc === q || bc2 === q || slug === q;
  });

  if (matches.length > 0) {
    // Tự động chốt mã SKU dài nhất (mã mới) nếu có nhiều mã trùng barcode
    matches.sort((a, b) => (b.slug || "").length - (a.slug || "").length);
    return { hit: matches[0], ambiguous: false, skus: [matches[0].slug] };
  }

  return { hit: null, ambiguous: false, skus: [] };
}