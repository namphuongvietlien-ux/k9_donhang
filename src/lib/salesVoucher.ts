/**
 * Phân loại dòng xuất bán: HANG vs DV (port GAS isXuatBanServiceLine_).
 */
export function isSalesServiceLine(input: {
  productSlug?: string | null;
  productName?: string | null;
  unit?: string | null;
  lineKind?: string | null;
}): boolean {
  const loai = String(input.lineKind || "")
    .trim()
    .toUpperCase();
  if (
    loai === "DV" ||
    loai === "DICHVU" ||
    loai === "SERVICE" ||
    loai === "DỊCH VỤ" ||
    loai === "DICH VU"
  ) {
    return true;
  }
  if (loai === "HANG" || loai === "SP" || loai === "PRODUCT") return false;

  const mh = String(input.productSlug || "")
    .trim()
    .toUpperCase();
  const th = String(input.productName || "")
    .trim()
    .toUpperCase();
  const dv = String(input.unit || "")
    .trim()
    .toUpperCase();

  if (mh.startsWith("DV-") || mh.startsWith("DV_") || mh === "DV") return true;
  if (
    dv === "DV" ||
    dv === "DICH VU" ||
    dv === "DỊCH VỤ" ||
    dv === "LAN" ||
    dv === "LẦN"
  ) {
    return true;
  }
  if (
    th.startsWith("DICH VU") ||
    th.startsWith("DỊCH VỤ") ||
    th.startsWith("PHÍ ")
  ) {
    return true;
  }
  return false;
}

export function normalizeInvoiceNo(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function generateXbCode(): string {
  return `XB-${Math.floor(100000 + Math.random() * 900000)}`;
}
