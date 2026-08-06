/**
 * Parse Excel/CSV điều chuyển nội bộ K9 → nhóm phiếu + dòng hàng.
 * Flexible header map (Mã hàng, SL xuất, Kho xuất/nhận, …).
 */

import {
  isImportJunkDataRow,
  mapImportHeaderColumns,
  normalizeHeaderText,
  normalizeImportedMatrix,
  normalizeProductCode,
  parseQuantityValue,
  resolveQtyColumnIndex,
  sanitizeImportDvt,
  type ImportColumnMap,
} from "@/lib/importMapping";
import { generateOrderCode, type ProductRef } from "@/lib/importOrders";
import { generateSlug } from "@/lib/slug";
import {
  buildOrderSkuSignature,
  inferPackingDayFromCreatedAt,
  normalizeOrderCodeText,
} from "@/lib/packingWindows";
import { applySoftLineRules } from "@/lib/softLineValidation";

export type TransferExtraRole =
  | "khoXuat"
  | "khoNhan"
  | "maLenh"
  | "soLuongXuat"
  | "ghiChu";

export interface TransferColumnMap extends ImportColumnMap {
  khoXuat: number;
  khoNhan: number;
  maLenh: number;
  soLuongXuat: number;
  ghiChu: number;
}

export interface WarehouseRef {
  id: string;
  code: string;
  name: string;
}

export interface TransferLineDraft {
  rowIndex: number;
  maHang: string;
  maVach: string;
  tenHang: string;
  dvt: string;
  quantity: number;
  khoXuatRaw: string;
  khoNhanRaw: string;
  maLenhRaw: string;
  ghiChuRaw: string;
  productId: string | null;
  productSlug: string | null;
  unitPrice: number;
  /** SKU không có trong catalog */
  isLoiMa: boolean;
  lineNotes: string;
  /** @deprecated alias */
  errorNote: string;
  hasSoftError: boolean;
}

export interface TransferVoucherDraft {
  key: string;
  maLenh: string | null;
  sourceWarehouseId: string;
  destWarehouseId: string;
  sourceLabel: string;
  destLabel: string;
  lines: TransferLineDraft[];
  totalQty: number;
}

export interface ParsedTransferImport {
  headerIndex: number;
  columns: TransferColumnMap;
  lines: TransferLineDraft[];
  vouchers: TransferVoucherDraft[];
  /** Số dòng mã không có trong catalog (LỖI MÃ) — không tạo SP mới */
  loiMaCount: number;
  skippedJunk: number;
  skippedEmpty: number;
  unresolvedWarehouseLines: number;
}

function cell(row: unknown[], idx: number): unknown {
  if (idx < 0 || !row) return "";
  return row[idx];
}

function scoreTransferExtra(norm: string, role: TransferExtraRole): number {
  if (!norm) return 0;

  if (role === "khoXuat") {
    if (norm === "khoxuat" || norm === "tukho" || norm === "fromwarehouse") return 100;
    if (norm === "chinhanhxuat" || norm === "coxuat") return 95;
    if (norm.includes("khoxuat") || norm.includes("tukho")) return 92;
    if (norm.includes("source") && norm.includes("ware")) return 88;
    if (norm === "from" || norm === "xuat") return 70;
    return 0;
  }

  if (role === "khoNhan") {
    if (norm === "khonhan" || norm === "denkho" || norm === "towarehouse") return 100;
    if (norm === "chinhanhnhan" || norm === "conhan") return 95;
    if (norm.includes("khonhan") || norm.includes("denkho")) return 92;
    if (norm.includes("dest") && norm.includes("ware")) return 88;
    if (norm === "to" || norm === "nhan") return 70;
    return 0;
  }

  if (role === "maLenh") {
    if (norm === "malenh" || norm === "sophieu" || norm === "madon") return 100;
    if (norm === "ordercode" || norm === "transfercode" || norm === "maphieu") return 95;
    if (norm.includes("malenh") || norm.includes("sophieu") || norm.includes("maphieu")) {
      return 90;
    }
    if (norm === "lenh" || norm === "phieu") return 75;
    return 0;
  }

  if (role === "ghiChu") {
    if (norm === "ghichu" || norm === "notes" || norm === "note" || norm === "remark") return 100;
    if (norm === "diengiai" || norm === "mota" || norm === "comment") return 90;
    if (norm.includes("ghichu") || norm.includes("notes")) return 88;
    return 0;
  }

  // Số lượng xuất — ưu tiên hơn cột tồn
  if (role === "soLuongXuat") {
    if (norm.includes("tonkho") || norm.includes("tonhientai")) return 0;
    if (norm === "soluongxuat" || norm === "slxuat" || norm === "qtyout") return 100;
    if (norm.includes("soluongxuat") || norm.includes("slxuat")) return 95;
    if (norm === "sl" || norm === "soluong" || norm === "qty" || norm === "quantity") return 90;
    if (norm.includes("soluong") && !norm.includes("ton")) return 85;
    return 0;
  }

  return 0;
}

export function mapTransferHeaderColumns(headerRow: unknown[]): TransferColumnMap {
  const base = mapImportHeaderColumns(headerRow);
  const out: TransferColumnMap = {
    ...base,
    khoXuat: -1,
    khoNhan: -1,
    maLenh: -1,
    soLuongXuat: -1,
    ghiChu: -1,
  };

  if (!headerRow?.length) return out;

  const extras: TransferExtraRole[] = [
    "khoXuat",
    "khoNhan",
    "maLenh",
    "soLuongXuat",
    "ghiChu",
  ];
  const best: Record<string, { idx: number; score: number }> = {};
  for (const role of extras) best[role] = { idx: -1, score: 0 };

  const taken = new Set<number>(
    (["maHang", "maVach", "tenHang", "dvt", "dvt2", "parentSku", "tonKho", "soLuong"] as const)
      .map((r) => base[r])
      .filter((i) => i >= 0),
  );

  for (let c = 0; c < headerRow.length; c++) {
    if (taken.has(c)) continue;
    const norm = normalizeHeaderText(headerRow[c]);
    if (!norm) continue;
    for (const role of extras) {
      const sc = scoreTransferExtra(norm, role);
      if (sc > best[role].score) best[role] = { idx: c, score: sc };
    }
  }

  // Prefer soLuongXuat over generic soLuong / tonKho
  const qtyExtra = best.soLuongXuat;
  if (qtyExtra.idx >= 0 && qtyExtra.score >= 70) {
    out.soLuongXuat = qtyExtra.idx;
    out.soLuong = qtyExtra.idx;
    out.scores.soLuong = qtyExtra.score;
    out.labels.soLuong = String(headerRow[qtyExtra.idx] ?? "");
    taken.add(qtyExtra.idx);
  }

  for (const role of ["khoXuat", "khoNhan", "maLenh", "ghiChu"] as const) {
    const cand = best[role];
    if (!cand || cand.idx < 0 || cand.score < 70 || taken.has(cand.idx)) continue;
    out[role] = cand.idx;
    taken.add(cand.idx);
  }

  return out;
}

export function findTransferHeaderRowIndex(rows: unknown[][], maxScan = 15): number {
  if (!rows?.length) return 0;
  const limit = Math.min(rows.length, maxScan);
  let bestScore = -1;
  let best = 0;
  for (let hi = 0; hi < limit; hi++) {
    const mapped = mapTransferHeaderColumns(rows[hi] || []);
    let score = 0;
    if (mapped.maHang >= 0) score += mapped.scores.maHang || 80;
    if (mapped.tenHang >= 0) score += mapped.scores.tenHang || 70;
    if (mapped.soLuong >= 0 || mapped.soLuongXuat >= 0) score += 90;
    if (mapped.khoXuat >= 0) score += 80;
    if (mapped.khoNhan >= 0) score += 80;
    if (mapped.maLenh >= 0) score += 40;
    if (score > bestScore) {
      bestScore = score;
      best = hi;
    }
  }
  return best;
}

/** Resolve warehouse by code / name (flexible K9 labels) */
export function resolveWarehouse(
  raw: string,
  warehouses: WarehouseRef[],
): WarehouseRef | null {
  const t = String(raw || "").trim();
  if (!t) return null;
  const norm = normalizeOrderCodeText(t);
  const compact = normalizeHeaderText(t);

  const byCode = warehouses.find(
    (w) =>
      normalizeOrderCodeText(w.code) === norm ||
      normalizeHeaderText(w.code) === compact,
  );
  if (byCode) return byCode;

  const byNameExact = warehouses.find(
    (w) => normalizeHeaderText(w.name) === compact || normalizeOrderCodeText(w.name) === norm,
  );
  if (byNameExact) return byNameExact;

  // Partial: "Kho Q7", "Chi nhánh Q5", …
  const byIncludes = warehouses.find((w) => {
    const code = normalizeHeaderText(w.code);
    return (
      code &&
      (compact.includes(code) ||
        compact.includes(normalizeHeaderText(w.name)) ||
        normalizeHeaderText(w.name).includes(compact))
    );
  });
  return byIncludes || null;
}

export function slugFromSku(maHang: string, tenHang: string): string {
  const code = normalizeProductCode(maHang);
  if (code) {
    const fromCode = generateSlug(code) || code.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (fromCode) return fromCode;
  }
  return generateSlug(tenHang || "san-pham") || `sp-${Date.now()}`;
}

export interface ParseTransferOptions {
  catalog: ProductRef[];
  warehouses: WarehouseRef[];
  /** Fallback khi file thiếu cột kho */
  defaultSourceWarehouseId?: string | null;
  defaultDestWarehouseId?: string | null;
}

export function parseTransferImportMatrix(
  rawMatrix: unknown[][],
  options: ParseTransferOptions,
): ParsedTransferImport {
  const matrix = normalizeImportedMatrix(rawMatrix);
  const headerIndex = findTransferHeaderRowIndex(matrix, 15);
  const columns = mapTransferHeaderColumns(matrix[headerIndex] || []);
  const qtyCol =
    columns.soLuongXuat >= 0
      ? columns.soLuongXuat
      : resolveQtyColumnIndex(columns);

  if (columns.maHang < 0 && columns.maVach < 0) {
    throw new Error("Không tìm thấy cột Mã hàng / SKU trong file.");
  }
  if (qtyCol < 0) {
    throw new Error("Không tìm thấy cột Số lượng xuất (SL / Số lượng / Qty).");
  }

  const hasKhoCols =
    columns.khoXuat >= 0 && (columns.khoNhan >= 0 || columns.ghiChu >= 0);
  if (
    !hasKhoCols &&
    (!options.defaultSourceWarehouseId || !options.defaultDestWarehouseId)
  ) {
    throw new Error(
      "File thiếu cột Kho xuất / Kho nhận (hoặc Ghi chú chứa mã kho). Chọn kho mặc định trên form hoặc thêm cột vào Excel.",
    );
  }

  const catalogBySlug = new Map<string, ProductRef>();
  for (const p of options.catalog) {
    const k = normalizeOrderCodeText(p.slug || "");
    if (k) catalogBySlug.set(k, p);
  }

  const lines: TransferLineDraft[] = [];
  let skippedJunk = 0;
  let skippedEmpty = 0;
  let unresolvedWarehouseLines = 0;
  let loiMaCount = 0;

  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    if (isImportJunkDataRow(row, columns)) {
      skippedJunk++;
      continue;
    }

    const maHang = normalizeProductCode(cell(row, columns.maHang));
    const maVach = normalizeProductCode(cell(row, columns.maVach));
    const sku = maHang || maVach;
    const tenHangRaw = String(cell(row, columns.tenHang) ?? "").trim();
    const dvt = sanitizeImportDvt(cell(row, columns.dvt));
    const quantity = parseQuantityValue(cell(row, qtyCol));
    const khoXuatRaw = String(cell(row, columns.khoXuat) ?? "").trim();
    const khoNhanCell = String(cell(row, columns.khoNhan) ?? "").trim();
    const maLenhRaw = String(cell(row, columns.maLenh) ?? "").trim();
    const ghiChuRaw = String(cell(row, columns.ghiChu) ?? "").trim();
    // Ghi chú có thể chứa mã kho nhận (file GAS cũ)
    const khoNhanRaw = khoNhanCell || (ghiChuRaw && !khoNhanCell ? ghiChuRaw : "");

    if (!sku) {
      skippedEmpty++;
      continue;
    }

    let errorNote = "";
    // Soft rules PRD — không chặn, không auto-create
    const slugKey = normalizeOrderCodeText(sku);
    let product = catalogBySlug.get(slugKey) || null;
    if (!product && tenHangRaw) {
      product =
        options.catalog.find(
          (p) => p.name.trim().toLowerCase() === tenHangRaw.toLowerCase(),
        ) || null;
    }

    const soft = applySoftLineRules({
      rawQty: quantity,
      fileDvt: dvt,
      catalogUnit: product?.unit,
      productFound: !!product,
    });
    errorNote = soft.lineNotes;
    const isLoiMa = !product;
    if (isLoiMa) loiMaCount++;

    const srcWh = hasKhoCols
      ? resolveWarehouse(khoXuatRaw, options.warehouses)
      : options.warehouses.find((w) => w.id === options.defaultSourceWarehouseId) ||
        null;
    const destWh =
      (hasKhoCols || khoNhanRaw
        ? resolveWarehouse(khoNhanRaw, options.warehouses)
        : null) ||
      options.warehouses.find((w) => w.id === options.defaultDestWarehouseId) ||
      null;

    const srcResolved =
      srcWh ||
      options.warehouses.find((w) => w.id === options.defaultSourceWarehouseId) ||
      null;
    const destResolved =
      destWh ||
      options.warehouses.find((w) => w.id === options.defaultDestWarehouseId) ||
      null;

    // Chỉ soft-warn khi không nhận diện kho (không chặn kho xuất = nhận)
    if (!srcResolved || !destResolved) {
      errorNote = soft.lineNotes
        ? `${soft.lineNotes}; Không nhận diện được kho xuất/nhận`
        : "Không nhận diện được kho xuất/nhận";
      unresolvedWarehouseLines++;
    }

    lines.push({
      rowIndex: i + 1,
      maHang: sku,
      maVach,
      tenHang: product?.name || tenHangRaw || sku,
      dvt: soft.dvtResolved,
      quantity: soft.quantity,
      khoXuatRaw: srcResolved?.code || khoXuatRaw,
      khoNhanRaw: destResolved?.code || khoNhanRaw,
      maLenhRaw,
      ghiChuRaw,
      productId: product?.id ?? null,
      productSlug: product?.slug ?? sku,
      unitPrice: product?.price ?? 0,
      isLoiMa,
      lineNotes: errorNote,
      errorNote,
      hasSoftError: soft.hasSoftError || !srcResolved || !destResolved,
    });
  }

  const vouchers = groupTransferLines(lines, options.warehouses, {
    defaultSourceWarehouseId: options.defaultSourceWarehouseId,
    defaultDestWarehouseId: options.defaultDestWarehouseId,
  });

  return {
    headerIndex,
    columns,
    lines,
    vouchers,
    loiMaCount,
    skippedJunk,
    skippedEmpty,
    unresolvedWarehouseLines,
  };
}

function isBlockingLineError(note: string): boolean {
  // PRD: Lỗi SL/ĐVT/Mã là soft — chỉ chặn khi không gom được kho
  if (!note) return false;
  return note.includes("Không nhận diện");
}

function groupTransferLines(
  lines: TransferLineDraft[],
  warehouses: WarehouseRef[],
  defaults: {
    defaultSourceWarehouseId?: string | null;
    defaultDestWarehouseId?: string | null;
  },
): TransferVoucherDraft[] {
  const map = new Map<string, TransferVoucherDraft>();

  for (const line of lines) {
    // Soft: vẫn gom cả dòng qty=0 (Lỗi SL)
    if (isBlockingLineError(line.lineNotes || line.errorNote)) continue;

    const src =
      resolveWarehouse(line.khoXuatRaw, warehouses) ||
      warehouses.find((w) => w.id === defaults.defaultSourceWarehouseId);
    const dest =
      resolveWarehouse(line.khoNhanRaw, warehouses) ||
      warehouses.find((w) => w.id === defaults.defaultDestWarehouseId);

    // Cho phép src === dest
    if (!src || !dest) continue;

    const maLenh = line.maLenhRaw.trim() || null;
    const key = `${maLenh || "_"}|${src.id}|${dest.id}`;

    let v = map.get(key);
    if (!v) {
      v = {
        key,
        maLenh,
        sourceWarehouseId: src.id,
        destWarehouseId: dest.id,
        sourceLabel: src.code,
        destLabel: dest.code,
        lines: [],
        totalQty: 0,
      };
      map.set(key, v);
    }
    v.lines.push(line);
    v.totalQty += line.quantity;
  }

  return Array.from(map.values());
}

/** Chữ ký SKU cho check trùng ≤5 phút (GAS) */
export function buildTransferSkuSignature(lines: TransferLineDraft[]): string {
  const skuQty: Record<string, number> = {};
  for (const l of lines) {
    if (l.quantity <= 0) continue;
    const k = normalizeOrderCodeText(
      l.isLoiMa ? `LOIMA:${l.tenHang}` : l.productSlug || l.maHang,
    );
    if (!k) continue;
    skuQty[k] = (skuQty[k] || 0) + l.quantity;
  }
  return buildOrderSkuSignature(skuQty);
}

export function buildTransferOrderPayload(voucher: TransferVoucherDraft, now = new Date()) {
  const inferred = inferPackingDayFromCreatedAt(now);
  const rawLenh = voucher.maLenh?.trim() || "";
  const orderCode =
    rawLenh && /^DC-/i.test(rawLenh)
      ? rawLenh
      : generateOrderCode("DieuChuyen");

  const hasError = voucher.lines.some(
    (l) => l.hasSoftError || !!(l.lineNotes || l.errorNote),
  );
  const totalAmount = voucher.lines.reduce(
    (s, l) => s + (l.unitPrice || 0) * l.quantity,
    0,
  );

  const orderRow = {
    order_code: orderCode,
    order_kind: "DC",
    customer_name: `Điều chuyển ${voucher.sourceLabel} → ${voucher.destLabel}`,
    customer_phone: null as string | null,
    customer_address: null as string | null,
    warehouse_id: voucher.destWarehouseId,
    source_warehouse_id: voucher.sourceWarehouseId,
    packing_date: inferred.win.packingDayStr,
    packing_shift: inferred.mode === "supp" ? "supplement" : "main",
    status: "pending", // Mới
    total_amount: totalAmount,
    subtotal: totalAmount,
    shipping_fee: 0,
    is_free_shipping: true,
    notes: hasError
      ? "Import DC — có dòng cần điều chỉnh (Lỗi SL/ĐVT/Mã)"
      : voucher.lines.find((l) => l.ghiChuRaw)?.ghiChuRaw
        ? `Import DC. Ghi chú: ${voucher.lines.find((l) => l.ghiChuRaw)?.ghiChuRaw}`
        : "Import điều chuyển nội bộ từ Excel/CSV",
    has_error: hasError,
    duplicate_accepted: false,
  };

  const itemRows = voucher.lines.map((l) => ({
    product_name: l.tenHang,
    product_slug: l.productSlug,
    product_image: null as string | null,
    price: l.unitPrice || 0,
    quantity: l.quantity,
    qty_requested: l.quantity,
    qty_packed: null as number | null,
    qty_received: null as number | null,
    shipping_fee: 0,
    line_notes: l.lineNotes || l.errorNote || null,
    barcode: l.maVach || null,
    unit: l.dvt || null,
  }));

  return { orderRow, itemRows, orderCode, hasError };
}
