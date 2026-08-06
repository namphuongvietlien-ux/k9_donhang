/**
 * Soft line validation — PRD nghiệp vụ K9 (non-blocking).
 * Không throw, không auto-create product.
 */

export const SOFT_NOTE_SL = "Lỗi SL";
export const SOFT_NOTE_DVT = "Lỗi ĐVT";
export const SOFT_NOTE_SKU = "Mã không tồn tại";

export function appendSoftNote(
  existing: string,
  fragment: string,
): string {
  const f = fragment.trim();
  if (!f) return existing.trim();
  if (!existing.trim()) return f;
  if (existing.includes(f)) return existing;
  return `${existing}; ${f}`;
}

export function normalizeUnitKey(unit: string | null | undefined): string {
  return String(unit || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, "");
}

/**
 * Áp dụng 3 luật mềm: SL / ĐVT / SKU.
 * Trả về qty (0 nếu lỗi SL), lineNotes, hasSoftError.
 */
export function applySoftLineRules(input: {
  rawQty: number;
  fileDvt: string;
  catalogUnit: string | null | undefined;
  productFound: boolean;
}): {
  quantity: number;
  lineNotes: string;
  hasSoftError: boolean;
  dvtResolved: string;
} {
  let lineNotes = "";
  let quantity = input.rawQty;

  if (!quantity || quantity <= 0 || Number.isNaN(quantity)) {
    quantity = 0;
    lineNotes = appendSoftNote(lineNotes, SOFT_NOTE_SL);
  }

  if (!input.productFound) {
    lineNotes = appendSoftNote(lineNotes, SOFT_NOTE_SKU);
  }

  let dvtResolved = String(input.fileDvt || "").trim();
  if (!dvtResolved && input.catalogUnit) {
    dvtResolved = String(input.catalogUnit).trim();
  }

  if (!dvtResolved) {
    lineNotes = appendSoftNote(lineNotes, SOFT_NOTE_DVT);
  } else if (
    input.productFound &&
    input.catalogUnit &&
    normalizeUnitKey(dvtResolved) !== normalizeUnitKey(input.catalogUnit)
  ) {
    lineNotes = appendSoftNote(lineNotes, SOFT_NOTE_DVT);
  }

  return {
    quantity,
    lineNotes,
    hasSoftError: !!lineNotes,
    dvtResolved: dvtResolved || "",
  };
}

/** Status bị loại khỏi check trùng ≤5 phút (PRD) */
export const DUP_EXCLUDED_STATUSES = [
  "processing", // Đã soạn
  "cancelled", // Hủy
  "cancelled_duplicate", // Hủy (Trùng)
] as const;

export function isExcludedFromDuplicateCheck(
  status: string | null | undefined,
  notes?: string | null,
): boolean {
  const s = String(status || "").toLowerCase().trim();
  if (
    s === "processing" ||
    s === "cancelled" ||
    s === "cancelled_duplicate" ||
    s.includes("hủy") ||
    s.includes("huy")
  ) {
    return true;
  }
  // Label tiếng Việt nếu lưu thẳng
  if (s.includes("đã soạn") || s.includes("da soan")) return true;
  const n = String(notes || "").toLowerCase();
  if (n.includes("hủy (trùng)") || n.includes("huy (trung)")) return true;
  return false;
}
