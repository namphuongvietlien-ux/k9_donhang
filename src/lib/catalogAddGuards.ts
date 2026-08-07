/**
 * Chặn thêm SP khóa / hết hàng vào phiếu (toast đỏ).
 */

export type CatalogBlockFlags = {
  is_locked?: boolean | null;
  is_out_stock?: boolean | null;
  slug?: string | null;
  name?: string | null;
};

export type CatalogAddBlock =
  | { blocked: true; title: string; description: string }
  | { blocked: false };

/** Kiểm tra trước khi thêm vào lưới / form — ưu tiên khóa trước hết hàng. */
export function checkCatalogAddBlocked(
  p: CatalogBlockFlags | null | undefined,
): CatalogAddBlock {
  if (!p) return { blocked: false };
  if (p.is_locked) {
    return {
      blocked: true,
      title: "Sản phẩm này đã bị khóa (ngừng giao dịch)!",
      description: p.slug || p.name || "",
    };
  }
  if (p.is_out_stock) {
    return {
      blocked: true,
      title: "Sản phẩm này đã hết hàng!",
      description: p.slug || p.name || "",
    };
  }
  return { blocked: false };
}
