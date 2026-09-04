/** Nhóm ngành trên catalog: thuốc (gồm vật tư y tế), hàng hóa, dịch vụ. */

export type ProductCategoryGroup = "THUOC" | "HANG_HOA" | "DICH_VU";

export const SERVICE_PICK_MEDICINE_TITLE = "Không cho phép nhập dịch vụ";
export const SERVICE_PICK_MEDICINE_DESC =
  "Hãy chọn đúng tên thuốc khi nhập dịch vụ.";

export function normalizeCategoryGroup(
  value?: string | null,
): ProductCategoryGroup | null {
  const g = String(value || "")
    .trim()
    .toUpperCase();
  if (g === "THUOC" || g === "HANG_HOA" || g === "DICH_VU") return g;
  return null;
}

export function isMedicineCategory(value?: string | null): boolean {
  return normalizeCategoryGroup(value) === "THUOC";
}

export function isServiceCategory(value?: string | null): boolean {
  return normalizeCategoryGroup(value) === "DICH_VU";
}

/** Tên không chứa chữ cái (mã số / ký hiệu) — dùng để ẩn SKU rác. */
export function isNonLetterCodeName(name?: string | null): boolean {
  const t = String(name || "").trim();
  if (!t) return false;
  return !/[A-Za-zÀ-ỹ]/.test(t);
}

/**
 * Mã vạch (hoặc slug) trùng name và name không phải dạng chữ.
 * Ví dụ: slug=name=barcode `000724`, `8850477810037`.
 */
export function isHiddenBarcodeAlias(p: {
  slug?: string | null;
  name?: string | null;
  barcode?: string | null;
  barcode_2?: string | null;
}): boolean {
  const name = String(p.name || "").trim();
  if (!isNonLetterCodeName(name)) return false;
  const slug = String(p.slug || "").trim();
  const bc = String(p.barcode || "").trim();
  const bc2 = String(p.barcode_2 || "").trim();
  if (name === slug || name === bc || name === bc2) return true;
  return Boolean(slug) && isNonLetterCodeName(slug);
}

function foldCode(value?: string | null): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .trim()
    .toUpperCase();
}

/** SKU dịch vụ phòng khám / mã ĐT001 / tên bắt đầu bằng DV. */
export function isServiceCatalogItem(p: {
  category_group?: string | null;
  slug?: string | null;
  name?: string | null;
  unit?: string | null;
}): boolean {
  if (isMedicineCategory(p.category_group)) return false;
  if (isServiceCategory(p.category_group)) return true;

  const name = String(p.name || "")
    .normalize("NFC")
    .trim()
    .toUpperCase();
  const slug = foldCode(p.slug);
  if (
    name.startsWith("DV ") ||
    name.startsWith("DV-") ||
    name.startsWith("DICH VU") ||
    name.startsWith("DỊCH VỤ") ||
    name.startsWith("PHÍ ")
  ) {
    return true;
  }
  if (
    slug.startsWith("DV-") ||
    slug.startsWith("DV_") ||
    slug === "DV" ||
    slug.startsWith("DT001")
  ) {
    return true;
  }
  const unit = String(p.unit || "")
    .trim()
    .toUpperCase();
  return unit === "DV" || unit === "DICH VU" || unit === "DỊCH VỤ";
}

export function isVisibleSellableCatalog(p: {
  is_active?: boolean | null;
  slug?: string | null;
  name?: string | null;
  barcode?: string | null;
  barcode_2?: string | null;
}): boolean {
  if (p.is_active === false) return false;
  if (!p.slug) return false;
  if (isHiddenBarcodeAlias(p)) return false;
  return true;
}
