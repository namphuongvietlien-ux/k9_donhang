/**
 * Port GAS nhapKhauCapNhatThongTin — catalogFast + stockQ7 (parse phía client).
 *   Ghi vào products + stock_on_hand thay cho Data_Excel / TON_Q7.
 * stock_on_hand key = (warehouse, product, ĐVT) — khớp GAS MH:…|DV:…
 */

import {
  findImportHeaderRowIndex,
  isImportJunkDataRow,
  isImportRatioHeaderNorm,
  mapImportHeaderColumns,
  scoreImportHeaderRole,
  normalizeHeaderText,
  normalizeImportedMatrix,
  normalizeProductCode,
  parseQuantityValue,
  sanitizeImportDvt,
  type ImportColumnMap,
} from "@/lib/importMapping";
import { generateSlug } from "@/lib/slug";
import { normalizeOrderCodeText } from "@/lib/packingWindows";
import {
  isMisaWarehouseRowName,
  resolveMisaStoreCode,
} from "@/lib/warehouseMeta";

export type CatalogStockImportMode = "catalogFast" | "stockQ7";
export type CatalogStockLayout = "flat" | "misaSummary";

export interface CatalogExistingRef {
  id: string;
  name: string;
  unit: string | null;
  slug?: string | null;
}

export interface CatalogStockLine {
  rowIndex: number;
  maHang: string;
  maVach: string;
  tenHang: string;
  dvt: string;
  parentSku: string;
  price: number | null;
  /** KiotViet cột T — có giá trị nghĩa là dòng ĐVT quy đổi (1 ĐVT này = N ĐVT cơ sở) */
  tyLeQuyDoi: number | null;
  tonKho: number | null;
  khoRaw: string;
  /** warehouses.code khi đọc được cột Cửa hàng (file TỔNG HỢP TỒN KHO) */
  warehouseCode: string | null;
  productSlug: string;
  errorNote: string;
  willCreate: boolean;
}

export interface ParsedCatalogStockImport {
  mode: CatalogStockImportMode;
  layout: CatalogStockLayout;
  headerIndex: number;
  columns: ImportColumnMap;
  khoCol: number;
  lines: CatalogStockLine[];
  validCount: number;
  newProductCount: number;
  withStockCount: number;
  skippedJunk: number;
  skippedEmpty: number;
  skippedTotals: number;
  skippedUnknownStore: number;
  warehouseCounts: Record<string, number>;
  /** Thông tin để debug khi file đọc ra 0 dòng */
  diagnostics: CatalogStockDiagnostics;
}

export interface CatalogStockDiagnostics {
  /** Dòng tiêu đề đã nhận (1-based) */
  headerRowNumber: number;
  headerCells: string[];
  /** Cột đã ánh xạ: vai trò → tiêu đề gốc */
  mappedColumns: Record<string, string>;
  /** 5 dòng dữ liệu đầu sau tiêu đề (đã bỏ ô trống cuối) */
  sampleRows: string[][];
  /** Tên cửa hàng trong file không ánh xạ được sang mã kho (tối đa 10) */
  unknownStores: string[];
  /** Lý do loại từng dòng mẫu (dòng số → lý do) */
  sampleSkips: { row: number; reason: string }[];
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

/** Cột "Tỷ lệ quy đổi" — ưu tiên khớp đúng, không lẫn với "Mã đơn vị tính chuyển đổi". */
function findRatioColumn(headerRow: unknown[]): number {
  if (!headerRow?.length) return -1;
  let best = { idx: -1, score: 0 };
  for (let c = 0; c < headerRow.length; c++) {
    const norm = normalizeHeaderText(headerRow[c]);
    if (!norm) continue;
    let score = 0;
    if (norm === "tylequydoi" || norm === "tilequydoi") score = 100;
    else if (isImportRatioHeaderNorm(norm)) score = 95;
    else if (norm === "hesoquydoi") score = 90;
    if (score > best.score) best = { idx: c, score };
  }
  return best.score >= 90 ? best.idx : -1;
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
  /** slug / barcode đã chuẩn hoá → SP */
  existingBySlug: Map<string, CatalogExistingRef>;
  existingByBarcode?: Map<string, CatalogExistingRef>;
  /** Chi nhánh chỉ được ghi các kho này; null = tất cả */
  allowedWarehouseCodes?: string[] | null;
}

function lookupExisting(
  code: string,
  options: ParseCatalogStockOptions,
): CatalogExistingRef | undefined {
  const key = normalizeOrderCodeText(code);
  if (!key) return undefined;
  return (
    options.existingBySlug.get(key) ||
    options.existingByBarcode?.get(key)
  );
}

function detectMisaSummaryLayout(
  headerRow: unknown[],
  columns: ImportColumnMap,
  khoCol: number,
): boolean {
  const blob = (headerRow || []).map((c) => normalizeHeaderText(c)).join(" ");
  if (blob.includes("cuoiky") && (blob.includes("cuahang") || blob.includes("nhapkho"))) {
    return true;
  }
  if (columns.tonKho < 0 || khoCol < 0) return false;
  const tonNorm = normalizeHeaderText(headerRow[columns.tonKho]);
  const khoNorm = normalizeHeaderText(headerRow[khoCol]);
  return tonNorm.includes("cuoiky") && (khoNorm.includes("cuahang") || khoNorm === "kho");
}

function isMisaSubheaderCode(code: string): boolean {
  return /^\(\d+\)$/.test(code.trim());
}

/** Dòng "Tổng công ty" / "Tổng cộng" của MISA — chỉ nhìn ô Tên hàng và Cửa hàng. */
function isMisaCompanyTotalRow(
  row: unknown[],
  columns: ImportColumnMap,
  khoCol: number,
): boolean {
  const name = normalizeHeaderText(cell(row, columns.tenHang));
  const store = khoCol >= 0 ? normalizeHeaderText(cell(row, khoCol)) : "";
  const hit = (t: string) =>
    !!t && (t.includes("tongcong") || t === "tong" || t.startsWith("total"));
  return hit(name) || hit(store);
}

/** Dòng lặp lại tiêu đề giữa file (MISA ngắt trang) */
function isHeaderLikeRow(row: unknown[], columns: ImportColumnMap): boolean {
  let n = 0;
  for (const [role, idx] of [
    ["maHang", columns.maHang],
    ["tenHang", columns.tenHang],
    ["dvt", columns.dvt],
  ] as const) {
    if (idx < 0) continue;
    if (scoreImportHeaderRole(normalizeHeaderText(cell(row, idx)), role) >= 70) n++;
  }
  return n >= 2;
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
  const ratioCol = findRatioColumn(matrix[headerIndex] || []);
  const layout: CatalogStockLayout = detectMisaSummaryLayout(
    matrix[headerIndex] || [],
    columns,
    khoCol,
  )
    ? "misaSummary"
    : "flat";

  if (columns.maHang < 0 && columns.maVach < 0) {
    throw new Error("Không tìm thấy cột Mã hàng / Mã vạch (như file nhập khẩu GAS).");
  }

  if (options.mode === "stockQ7") {
    const tonCol = columns.tonKho >= 0 ? columns.tonKho : columns.soLuong;
    if (tonCol < 0) {
      throw new Error(
        "File tồn kho thiếu cột Tồn kho / Số lượng / Cuối kỳ. Kiểm tra tiêu đề cột.",
      );
    }
  }

  const allowed = options.allowedWarehouseCodes?.length
    ? new Set(options.allowedWarehouseCodes.map((c) => c.trim().toUpperCase()))
    : null;

  const lines: CatalogStockLine[] = [];
  let skippedJunk = 0;
  let skippedEmpty = 0;
  let skippedTotals = 0;
  let skippedUnknownStore = 0;
  let newProductCount = 0;
  let withStockCount = 0;
  const warehouseCounts: Record<string, number> = {};
  let lastProductName = "";
  /** MISA có bản chỉ ghi Mã hàng hóa ở dòng đầu nhóm → kế thừa cho dòng cửa hàng bên dưới */
  let lastProductCode = "";
  const unknownStores = new Map<string, number>();
  const sampleSkips: { row: number; reason: string }[] = [];
  const noteSkip = (row: number, reason: string) => {
    if (sampleSkips.length < 8) sampleSkips.push({ row, reason });
  };

  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    // MISA: chỉ xét ô Tên hàng / Cửa hàng để nhận dòng "Tổng công ty" — tránh loại nhầm
    // cả file khi export có thêm cột ghi tên công ty ở mọi dòng.
    const junk =
      layout === "misaSummary"
        ? isMisaCompanyTotalRow(row, columns, khoCol) || isHeaderLikeRow(row, columns)
        : isImportJunkDataRow(row, columns);
    if (junk) {
      skippedJunk++;
      noteSkip(i + 1, "Dòng tổng / tiêu đề lặp / Tổng công ty");
      continue;
    }

    const maHang = normalizeProductCode(cell(row, columns.maHang));
    const maVach = normalizeProductCode(cell(row, columns.maVach));
    let sku = maHang || maVach;
    let tenHang = String(cell(row, columns.tenHang) ?? "").trim();
    const khoRaw = String(cell(row, khoCol) ?? "").trim();
    if (isMisaSubheaderCode(sku)) {
      skippedEmpty++;
      continue;
    }
    if (!sku && layout === "misaSummary") {
      const isStoreRow = !!khoRaw || isMisaWarehouseRowName(tenHang);
      if (isStoreRow && lastProductCode) sku = lastProductCode;
    }
    if (!sku) {
      skippedEmpty++;
      noteSkip(i + 1, "Trống Mã hàng / Mã vạch");
      continue;
    }
    if (layout === "misaSummary" && !khoRaw && !isMisaWarehouseRowName(tenHang)) {
      lastProductCode = sku;
    }

    const dvt = sanitizeImportDvt(cell(row, columns.dvt));
    const parentSku = normalizeProductCode(cell(row, columns.parentSku));
    const price = priceCol >= 0 ? parsePriceValue(cell(row, priceCol)) : null;
    const rawRatio = ratioCol >= 0 ? parsePriceValue(cell(row, ratioCol)) : null;
    const tyLeQuyDoi = rawRatio != null && rawRatio > 0 ? rawRatio : null;

    const tonCol = columns.tonKho >= 0 ? columns.tonKho : columns.soLuong;
    let tonKho: number | null = null;
    if (tonCol >= 0) {
      const raw = cell(row, tonCol);
      if (raw !== "" && raw !== null && raw !== undefined) {
        const n = parseQuantityValue(raw);
        tonKho = Number.isNaN(n) ? null : n;
      }
    }

    if (layout === "misaSummary") {
      const storeHint = khoRaw || (isMisaWarehouseRowName(tenHang) ? tenHang : "");
      const warehouseCode = resolveMisaStoreCode(storeHint);
      if (!storeHint) {
        if (tenHang && !isMisaWarehouseRowName(tenHang)) lastProductName = tenHang;
        skippedTotals++;
        continue;
      }
      if (!warehouseCode) {
        skippedUnknownStore++;
        unknownStores.set(storeHint, (unknownStores.get(storeHint) || 0) + 1);
        noteSkip(i + 1, `Không nhận ra cửa hàng "${storeHint}"`);
        continue;
      }
      if (allowed && !allowed.has(warehouseCode)) {
        skippedUnknownStore++;
        noteSkip(i + 1, `Kho ${warehouseCode} ngoài phạm vi tài khoản`);
        continue;
      }
      if (isMisaWarehouseRowName(tenHang) && lastProductName) {
        tenHang = lastProductName;
      } else if (tenHang && !isMisaWarehouseRowName(tenHang)) {
        lastProductName = tenHang;
      }
      warehouseCounts[warehouseCode] = (warehouseCounts[warehouseCode] || 0) + 1;

      const existing = lookupExisting(sku, options);
      const slug = existing?.slug || slugFromMaHang(sku, tenHang || sku);
      if (tonKho != null) withStockCount++;

      let errorNote = "";
      if (tonKho == null || tonKho < 0) errorNote = "Thiếu / lỗi tồn cuối kỳ";
      else if (!existing) errorNote = "Không khớp mã trong danh mục";

      lines.push({
        rowIndex: i + 1,
        maHang: existing?.slug || sku,
        maVach,
        tenHang: existing?.name || tenHang || sku,
        dvt: dvt || existing?.unit || "cái",
        parentSku,
        price,
        tyLeQuyDoi,
        tonKho,
        khoRaw: storeHint,
        warehouseCode,
        productSlug: slug,
        errorNote,
        willCreate: false,
      });
      continue;
    }

    const existing = lookupExisting(sku, options);
    const slug = existing?.slug || slugFromMaHang(sku, tenHang || sku);
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
      tyLeQuyDoi,
      tonKho,
      khoRaw,
      warehouseCode: resolveMisaStoreCode(khoRaw),
      productSlug: slug,
      errorNote,
      willCreate,
    });
  }

  const validCount = lines.filter((l) => !l.errorNote).length;

  const toText = (r: unknown[]) => {
    const out = (r || []).map((c) => String(c ?? "").trim());
    while (out.length && !out[out.length - 1]) out.pop();
    return out;
  };
  const headerCells = toText(matrix[headerIndex] || []);
  const mappedColumns: Record<string, string> = {};
  const roleLabel: Record<string, string> = {
    maHang: "Mã hàng",
    maVach: "Mã vạch",
    tenHang: "Tên hàng",
    dvt: "ĐVT",
    tonKho: "Tồn / Cuối kỳ",
    soLuong: "Số lượng",
    parentSku: "Parent SKU",
  };
  for (const [role, idx] of Object.entries(columns)) {
    if (typeof idx !== "number" || idx < 0 || !roleLabel[role]) continue;
    mappedColumns[roleLabel[role]] = headerCells[idx] ?? `cột ${idx + 1}`;
  }
  if (khoCol >= 0) mappedColumns["Cửa hàng / Kho"] = headerCells[khoCol] ?? `cột ${khoCol + 1}`;
  const sampleRows: string[][] = [];
  for (let i = headerIndex + 1; i < matrix.length && sampleRows.length < 5; i++) {
    const r = toText(matrix[i] || []);
    if (r.some(Boolean)) sampleRows.push(r);
  }

  return {
    mode: options.mode,
    layout,
    headerIndex,
    columns,
    khoCol,
    lines,
    validCount,
    newProductCount,
    withStockCount,
    skippedJunk,
    skippedEmpty,
    skippedTotals,
    skippedUnknownStore,
    warehouseCounts,
    diagnostics: {
      headerRowNumber: headerIndex + 1,
      headerCells,
      mappedColumns,
      sampleRows,
      unknownStores: [...unknownStores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, n]) => `${name} (×${n})`),
      sampleSkips,
    },
  };
}
