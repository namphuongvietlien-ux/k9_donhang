/**
 * Nhận diện thực phẩm chức năng (TPCN) đang nằm nhầm nhóm thức ăn / hàng hóa.
 * Snack/Jerhigh/CIAO giữ nguyên hàng hóa.
 */

export function foldTpcnText(value?: string | null): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function foldTpcnSlug(value?: string | null): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function isClearlyFoodOrTreat(name: string, slug: string): boolean {
  const n = foldTpcnText(name);
  const s = foldTpcnSlug(slug);
  if (s.startsWith("SNC")) return true;
  if (
    /jerhigh|juicy bites|ciao |mieng ga say|thuc an kho|ta hat|ta dang set|ta kho hon hop|reflex plus/.test(
      n,
    )
  ) {
    return true;
  }
  if (/stick\s*-\s*goi|banana stick|beef stick|blueberry stick|strawberry stick/.test(n)) {
    return true;
  }
  if (/huong vi/.test(n) && (/ciao|juicy|fillet|soup|tuna|chicken|nuoc thit|tabs cho meo/.test(n))) {
    return true;
  }
  if (/aller-zero/.test(n)) return true;
  if (/epioti|ear cleanser|natural core|puppy \d/.test(n)) return true;
  return false;
}

export function isTpcnProduct(p: {
  slug?: string | null;
  name?: string | null;
  sku_industry?: string | null;
  sku_detail?: string | null;
}): boolean {
  const name = String(p.name || "");
  const slug = foldTpcnSlug(p.slug);
  if (isClearlyFoodOrTreat(name, slug)) return false;

  const n = foldTpcnText(name);
  if (/thuoc thu y|bromhexine|brom max|\binj\b|inj-|injection/.test(n)) {
    return false;
  }
  if (/tpcn|thuc pham chuc nang/.test(n)) return true;

  if (
    /CNXXX/.test(slug) ||
    /^(H|M|C)CN/.test(slug)
  ) {
    return true;
  }
  if (/^TCN\d/.test(slug) && !/epioti|ear cleanser|natural core/.test(n)) {
    return true;
  }

  const industry = foldTpcnSlug(p.sku_industry).slice(0, 2);
  const detail = foldTpcnSlug(p.sku_detail).slice(0, 2);
  const fromSlug10 = /^[A-Z]{6}\d{4}$/.test(slug)
    ? { industry: slug.slice(0, 2), detail: slug.slice(2, 4) }
    : null;
  const isBs =
    (industry === "TA" && detail === "BS") ||
    (fromSlug10?.industry === "TA" && fromSlug10.detail === "BS");

  if (!isBs && !/^TAC\d/.test(slug) && !/^tabs/.test(n)) return false;

  if (
    /gel|oil|omega|vitamin|men |probisol|prolax|kidney|immuno|flora|canxi|calcium|elecamin|nuvita|clostop|quad|10kd|vf\+|pet lac|birthright|probio|hairball cure|hairball solution|tabs 120g|oral drops/.test(
      n,
    )
  ) {
    return true;
  }
  if (/^tabs/.test(n) && !/stick|cookie|bacon|jerky|juicy|ciao|huong/.test(n)) {
    return true;
  }
  if (/^TAC\d/.test(slug) && /vf\+/.test(n)) return true;
  return isBs;
}

/** Chỉ kéo sang thẻ Thuốc khi đang nằm thức ăn / hàng hóa, không đụng mã YT/VT sẵn đúng. */
export function needsTpcnThuocMove(p: {
  slug?: string | null;
  name?: string | null;
  sku_industry?: string | null;
  sku_detail?: string | null;
  category_group?: string | null;
}): boolean {
  if (!isTpcnProduct(p)) return false;
  const industry = foldTpcnSlug(p.sku_industry).slice(0, 2);
  if (industry === "YT" || industry === "VT") return false;
  const group = String(p.category_group || "").trim().toUpperCase();
  if (group === "THUOC") return false;
  return true;
}
