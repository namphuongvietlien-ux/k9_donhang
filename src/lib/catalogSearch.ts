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

export type CatalogMatchFields = {
  name?: string | null;
  slug?: string | null;
  barcode?: string | null;
  barcode_2?: string | null;
};

function foldSearchText(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function foldCode(s: string): string {
  return String(s || "")
    .trim()
    .normalize("NFC")
    .toUpperCase();
}

function barcodeDigits(s: string | null | undefined): string {
  return String(s || "").replace(/\D/g, "");
}

function itemBarcodes(item: CatalogMatchFields): string[] {
  return [barcodeDigits(item.barcode), barcodeDigits(item.barcode_2)].filter(
    Boolean,
  );
}

export function isSixDigitQuery(query: string): boolean {
  return /^\d{6}$/.test((query || "").trim());
}

function preferNewerSku(a: CatalogSearchItem, b: CatalogSearchItem): number {
  return foldCode(b.slug).length - foldCode(a.slug).length;
}

/**
 * Điểm xếp hạng: exact mã/tên > 6 số cuối vạch > prefix vạch > tên > mã hàng.
 * 6 số chỉ cộng điểm khi đúng đuôi barcode — không khớp giữa chuỗi.
 */
export function scoreCatalogItem(
  item: CatalogMatchFields,
  query: string,
): number {
  const raw = (query || "").trim();
  if (!raw) return 0;

  const qFold = foldSearchText(raw);
  const qCode = foldCode(raw);
  const qDigits = barcodeDigits(raw);
  const slug = foldCode(item.slug);
  const name = foldSearchText(item.name);
  const codes = itemBarcodes(item);

  if (codes.includes(qDigits) && qDigits.length >= 6) return 120;
  if (qCode && slug === qCode) return 110;
  if (qFold && name === qFold) return 100;

  if (/^\d{6}$/.test(qDigits) && qDigits === raw.trim()) {
    if (codes.some((bc) => bc.endsWith(qDigits))) return 80;
    return 0;
  }

  if (qDigits.length >= 4 && /^\d+$/.test(raw)) {
    if (codes.some((bc) => bc.startsWith(qDigits))) return 60;
    if (codes.some((bc) => bc.endsWith(qDigits))) return 55;
  }

  if (qFold && name.startsWith(qFold)) return 40;
  if (qFold && name.includes(qFold)) return 20;
  if (qCode && slug.includes(qCode)) return 10;
  return 0;
}

export function matchesCatalogQuery(
  item: CatalogMatchFields,
  query: string,
): boolean {
  return scoreCatalogItem(item, query) > 0;
}

export function filterCatalogSuggestions(
  items: CatalogSearchItem[],
  query: string,
  limit: number = 12,
): CatalogSearchItem[] {
  const raw = (query || "").trim();
  if (!raw) return [];

  const qFold = foldSearchText(raw);
  const qCode = foldCode(raw);
  const qDigits = barcodeDigits(raw);
  const six = /^\d{6}$/.test(raw);

  const exactMatches = items.filter((p) => {
    const slug = foldCode(p.slug);
    const name = foldSearchText(p.name);
    const codes = itemBarcodes(p);
    if (qDigits.length >= 6 && codes.includes(qDigits)) return true;
    if (qCode && slug === qCode) return true;
    if (qFold && name === qFold) return true;
    return false;
  });

  if (exactMatches.length > 0) {
    exactMatches.sort((a, b) => {
      const d = scoreCatalogItem(b, raw) - scoreCatalogItem(a, raw);
      return d !== 0 ? d : preferNewerSku(a, b);
    });
    return exactMatches.slice(0, limit);
  }

  const results = items.filter((p) => {
    const slug = foldCode(p.slug);
    const name = foldSearchText(p.name);
    const codes = itemBarcodes(p);

    if (six) {
      return codes.some((bc) => bc.endsWith(qDigits));
    }

    if (/^\d+$/.test(raw) && qDigits.length >= 4) {
      return codes.some(
        (bc) => bc.startsWith(qDigits) || bc.endsWith(qDigits),
      );
    }

    return (
      (qFold && name.includes(qFold)) ||
      (qCode && slug.includes(qCode)) ||
      (qDigits.length >= 4 &&
        codes.some((bc) => bc.startsWith(qDigits) || bc.endsWith(qDigits)))
    );
  });

  results.sort((a, b) => {
    const scoreA = scoreCatalogItem(a, raw);
    const scoreB = scoreCatalogItem(b, raw);
    if (scoreA === scoreB) return preferNewerSku(a, b);
    return scoreB - scoreA;
  });

  return results.slice(0, limit);
}

export function resolveCatalogScan(
  items: CatalogSearchItem[],
  query: string,
): { hit: CatalogSearchItem | null; ambiguous: boolean; skus: string[] } {
  const raw = (query || "").trim();
  if (!raw) return { hit: null, ambiguous: false, skus: [] };

  const qCode = foldCode(raw);
  const qDigits = barcodeDigits(raw);
  const six = /^\d{6}$/.test(raw);

  const matches = items.filter((p) => {
    const slug = foldCode(p.slug);
    const codes = itemBarcodes(p);
    if (qCode && slug === qCode) return true;
    if (qDigits.length >= 8 && codes.includes(qDigits)) return true;
    if (six) return codes.some((bc) => bc.endsWith(qDigits));
    return qDigits.length >= 6 && codes.includes(qDigits);
  });

  if (matches.length > 0) {
    matches.sort(preferNewerSku);
    return { hit: matches[0], ambiguous: false, skus: [matches[0].slug] };
  }

  return { hit: null, ambiguous: false, skus: [] };
}
