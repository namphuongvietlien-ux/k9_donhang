/**
 * Port GAS nhapKhauCapNhatThongTin — catalogFast + stockQ7 (parse phía client).
 *   Ghi vào products + stock_on_hand thay cho Data_Excel / TON_Q7.
 * stock_on_hand key = (warehouse, product, ĐVT) — khớp GAS MH:…|DV:…
 */

import {
  findImportHeaderRowIndex,
  isImportJunkDataRow,
  mapImportHeaderColumns,
  normalizeHeaderText,
  normalizeImportedMatrix,
  normalizeProductCode,
  parseQuantityValue,
  sanitizeImportDvt,
  type ImportColumnMap,
} from "@/lib/importMapping";
import { generateSlug } from "@/lib/slug";
import { normalizeOrderCodeText } from "@/lib/packingWindows";

export type CatalogStockImportMode = "catalogFast" | "stockQ7";

export interface CatalogStockLine {
  rowIndex: number;
  maHang: string;
  maVach: string;
  tenHang: string;
  dvt: string;
  parentSku: string;
  price: number | null;
  tonKho: number | null;
  khoRaw: string;
  productSlug: string;
  errorNote: string;
  willCreate: boolean;
}

export interface ParsedCatalogStockImport {
  mode: CatalogStockImportMode;
  headerIndex: number;
  columns: ImportColumnMap;
  khoCol: number;
  lines: CatalogStockLine[];
  validCount: number;
  newProductCount: number;
  withStockCount: number;
  skippedJunk: number;
  skippedEmpty: number;
}

function cell(row: unknown[], idx: number): unknown {
  if (idx < 0 || !row) return "";
  return row[idx];
}

function findKhoColumn(headerRow: unknown[]): number {
  if (!headerRow?.length) return -1;
  let best = { idx: -1, score: 0 };
  for (let c = 0; c < headerRow.length; c++) {
    const norm = normalizeHeaderText(headerRow[c]);
    if (!norm) continue;
    let score = 0;
    if (norm === "kho" || norm === "cuahang" || norm === "chinhanh" || norm === "store") {
      score = 100;
    } else if (norm.includes("tenkho") || norm.includes("makho")) {
      score = 95;
    } else if (norm.includes("kho") && !norm.includes("ton")) {
      score = 80;
    }
    if (score > best.score) best = { idx: c, score };
  }
  return best.score >= 70 ? best.idx : -1;
}

function findPriceColumn(headerRow: unknown[]): number {
  if (!headerRow?.length) return -1;
  let best = { idx: -1, score: 0 };
  for (let c = 0; c < headerRow.length; c++) {
    const norm = normalizeHeaderText(headerRow[c]);
    if (!norm) continue;
    let score = 0;
    if (norm === "price" || norm === "gia" || norm === "giaban") {
      score = 100;
    } else if (norm.includes("price") || norm.includes("gia")) {
      score = 90;
    }
    if (score > best.score) best = { idx: c, score };
  }
  return best.score >= 80 ? best.idx : -1;
}

function parsePriceValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  if (!text) return null;
  const cleaned = text
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(?:[.,]|$))/g, "")
    .replace(/,/g, ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function slugFromMaHang(maHang: string, tenHang: string): string {
  const code = normalizeProductCode(maHang);
  // Giữ nguyên mã hàng gốc từ Excel, chỉ trim và chuẩn hóa NFC; không ép dấu/biến thành slug URL.
  if (code) return String(code).trim();
  return generateSlug(tenHang || "san-pham") || `sp-${Date.now()}`;
}

export interface ParseCatalogStockOptions {
  mode: CatalogStockImportMode;
  /** Existing product slug → id (normalized keys) */
  existingBySlug: Map<string, { id: string; name: string; unit: string | null }>;
}

export function parseCatalogStockMatrix(
  rawMatrix: unknown[][],
  options: ParseCatalogStockOptions,
): ParsedCatalogStockImport {
  const matrix = normalizeImportedMatrix(rawMatrix);
  const headerIndex = findImportHeaderRowIndex(matrix, 15);
  const columns = mapImportHeaderColumns(matrix[headerIndex] || []);
  const khoCol = findKhoColumn(matrix[headerIndex] || []);
  const priceCol = findPriceColumn(matrix[headerIndex] || []);

  if (columns.maHang < 0 && columns.maVach < 0) {
    throw new Error("Không tìm thấy cột Mã hàng / Mã vạch (như file nhập khẩu GAS).");
  }

  if (options.mode === "stockQ7") {
    const tonCol = columns.tonKho >= 0 ? columns.tonKho : columns.soLuong;
    if (tonCol < 0) {
      throw new Error(
        "File tồn kho thiếu cột Tồn kho / Số lượng (TON_Q7). Kiểm tra tiêu đề cột.",
      );
    }
  }

  const lines: CatalogStockLine[] = [];
  let skippedJunk = 0;
  let skippedEmpty = 0;
  let newProductCount = 0;
  let withStockCount = 0;

  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    if (isImportJunkDataRow(row, columns)) {
      skippedJunk++;
      continue;
    }

    const maHang = normalizeProductCode(cell(row, columns.maHang));
    const maVach = normalizeProductCode(cell(row, columns.maVach));
    const sku = maHang || maVach;
    if (!sku) {
      skippedEmpty++;
      continue;
    }

    const tenHang = String(cell(row, columns.tenHang) ?? "").trim();
    const dvt = sanitizeImportDvt(cell(row, columns.dvt));
    const parentSku = normalizeProductCode(cell(row, columns.parentSku));
    const khoRaw = String(cell(row, khoCol) ?? "").trim();
    const price = priceCol >= 0 ? parsePriceValue(cell(row, priceCol)) : null;

    const tonCol = columns.tonKho >= 0 ? columns.tonKho : columns.soLuong;
    let tonKho: number | null = null;
    if (tonCol >= 0) {
      const raw = cell(row, tonCol);
      if (raw !== "" && raw !== null && raw !== undefined) {
        const n = parseQuantityValue(raw);
        tonKho = Number.isNaN(n) ? null : n;
      }
    }

    const slug = slugFromMaHang(sku, tenHang || sku);
    const existing = options.existingBySlug.get(normalizeOrderCodeText(slug));
    const willCreate = !existing;
    if (willCreate) newProductCount++;
    if (tonKho != null) withStockCount++;

    let errorNote = "";
    if (options.mode === "catalogFast" && willCreate && !tenHang) {
      // dùng mã làm tên — không block
    }
    if (options.mode === "stockQ7" && (tonKho == null || tonKho < 0)) {
      errorNote = "Thiếu / lỗi tồn kho";
    }

    lines.push({
      rowIndex: i + 1,
      maHang: sku,
      maVach,
      tenHang: existing?.name || tenHang || sku,
      dvt: dvt || existing?.unit || "cái",
      parentSku,
      price,
      tonKho,
      khoRaw,
      productSlug: slug,
      errorNote,
      willCreate,
    });
  }

  const validCount = lines.filter((l) => !l.errorNote).length;

  return {
    mode: options.mode,
    headerIndex,
    columns,
    khoCol,
    lines,
    validCount,
    newProductCount,
    withStockCount,
    skippedJunk,
    skippedEmpty,
  };
}
