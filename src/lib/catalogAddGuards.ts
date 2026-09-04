/**
 * Chặn thêm SP khóa / hết hàng / dịch vụ vào phiếu (toast đỏ).
 */

import {
  isHiddenBarcodeAlias,
  isServiceCatalogItem,
  SERVICE_PICK_MEDICINE_DESC,
  SERVICE_PICK_MEDICINE_TITLE,
} from "@/lib/productCategory";

export type CatalogBlockFlags = {
  is_locked?: boolean | null;
  is_out_stock?: boolean | null;
  slug?: string | null;
  name?: string | null;
  unit?: string | null;
  barcode?: string | null;
  barcode_2?: string | null;
  category_group?: string | null;
  is_active?: boolean | null;
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
  if (isHiddenBarcodeAlias(p) || p.is_active === false) {
    return {
      blocked: true,
      title: "Mã này đã được ẩn khỏi danh mục",
      description: p.slug || p.name || "",
    };
  }
  if (isServiceCatalogItem(p)) {
    return {
      blocked: true,
      title: SERVICE_PICK_MEDICINE_TITLE,
      description: SERVICE_PICK_MEDICINE_DESC,
    };
  }
  return { blocked: false };
}
