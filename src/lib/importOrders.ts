/**
 * Build order lines from import matrix — PRD soft rules (non-blocking).
 */

import {
  findImportHeaderRowIndex,
  isImportJunkDataRow,
  mapImportHeaderColumns,
  normalizeImportedMatrix,
  normalizeProductCode,
  parseQuantityValue,
  resolveQtyColumnIndex,
  sanitizeImportDvt,
  type ImportColumnMap,
} from "@/lib/importMapping";
import {
  buildOrderSkuSignature,
  inferPackingDayFromCreatedAt,
  normalizeOrderCodeText,
} from "@/lib/packingWindows";
import { applySoftLineRules } from "@/lib/softLineValidation";

export type PhieuLoai = "DonHang" | "DieuChuyen";

export interface ProductRef {
  id: string;
  name: string;
  slug: string | null;
  price: number | null;
  unit: string | null;
  barcode?: string | null;
}

export interface ImportLineDraft {
  rowIndex: number;
  maHang: string;
  maVach: string;
  tenHang: string;
  dvt: string;
  quantity: number;
  productId: string | null;
  productSlug: string | null;
  unitPrice: number;
  /** Ghi chú mềm dòng: Lỗi SL; Lỗi ĐVT; Mã không tồn tại */
  lineNotes: string;
  /** @deprecated alias lineNotes — UI cũ */
  errorNote: string;
  stockQty: number | null;
  stockLabel: "OK" | "THIẾU" | "Chưa có TON" | "—";
  hasSoftError: boolean;
}

export interface ParsedImportFile {
  headerIndex: number;
  columns: ImportColumnMap;
  lines: ImportLineDraft[];
  totalQty: number;
  skuSignature: string;
  skippedJunk: number;
  skippedEmpty: number;
  hasError: boolean;
  warningCount: number;
}

/** DH-xxxxxx / DC-xxxxxx */
export function generateOrderCode(loai: PhieuLoai): string {
  const prefix = loai === "DonHang" ? "DH" : "DC";
  const n = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${n}`;
}

function cell(row: unknown[], idx: number): unknown {
  if (idx < 0 || !row) return "";
  return row[idx];
}

export function resolveProductFromCatalog(
  catalog: ProductRef[],
  maHang: string,
  maVach: string,
  tenHang: string,
): ProductRef | null {
  const mh = normalizeOrderCodeText(maHang);
  const mv = normalizeOrderCodeText(maVach);
  const th = String(tenHang || "").trim().toLowerCase();

  if (mh) {
    const bySlug = catalog.find(
      (p) =>
        normalizeOrderCodeText(p.slug || "") === mh ||
        normalizeOrderCodeText(p.name) === mh,
    );
    if (bySlug) return bySlug;
  }
  if (mv) {
    const byBarcode = catalog.find(
      (p) =>
        normalizeOrderCodeText(p.barcode || "") === mv ||
        normalizeOrderCodeText(p.slug || "") === mv,
    );
    if (byBarcode) return byBarcode;
  }
  if (th) {
    const byName = catalog.find((p) => p.name.trim().toLowerCase() === th);
    if (byName) return byName;
  }
  return null;
}

export function parseOrderImportMatrix(
  rawMatrix: unknown[][],
  catalog: ProductRef[],
  stockBySlug: Map<string, number>,
): ParsedImportFile {
  const matrix = normalizeImportedMatrix(rawMatrix);
  const headerIndex = findImportHeaderRowIndex(matrix, 15);
  const columns = mapImportHeaderColumns(matrix[headerIndex] || []);
  const qtyCol = resolveQtyColumnIndex(columns);

  if (columns.maHang < 0 && columns.maVach < 0) {
    throw new Error("Không tìm thấy cột Mã hàng hoặc Mã vạch trong file.");
  }
  if (qtyCol < 0) {
    throw new Error("Không tìm thấy cột Số lượng (SL / Số lượng / Qty) trong file.");
  }

  const lines: ImportLineDraft[] = [];
  let skippedJunk = 0;
  let skippedEmpty = 0;
  const skuQty: Record<string, number> = {};

  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    if (isImportJunkDataRow(row, columns)) {
      skippedJunk++;
      continue;
    }

    const maHang = normalizeProductCode(cell(row, columns.maHang));
    const maVach = normalizeProductCode(cell(row, columns.maVach));
    const tenHangRaw = String(cell(row, columns.tenHang) ?? "").trim();
    const fileDvt = sanitizeImportDvt(cell(row, columns.dvt));
    const rawQty = parseQuantityValue(cell(row, qtyCol));

    if (!maHang && !maVach) {
      skippedEmpty++;
      continue;
    }

    const product = resolveProductFromCatalog(
      catalog,
      maHang,
      maVach,
      tenHangRaw,
    );
    const soft = applySoftLineRules({
      rawQty,
      fileDvt,
      catalogUnit: product?.unit,
      productFound: !!product,
    });

    const skuKeep = maHang || maVach || product?.slug || "";
    const tenHang = product?.name || tenHangRaw || skuKeep;
    const slugKey = normalizeOrderCodeText(product?.slug || skuKeep);
    const stockQty =
      slugKey && stockBySlug.has(slugKey) ? stockBySlug.get(slugKey)! : null;

    let stockLabel: ImportLineDraft["stockLabel"] = "—";
    if (!product) stockLabel = "—";
    else if (stockQty === null) stockLabel = "Chưa có TON";
    else if (soft.quantity > stockQty) stockLabel = "THIẾU";
    else stockLabel = "OK";

    if (soft.quantity > 0 && slugKey) {
      skuQty[slugKey] = (skuQty[slugKey] || 0) + soft.quantity;
    }

    lines.push({
      rowIndex: i + 1,
      maHang: skuKeep,
      maVach,
      tenHang,
      dvt: soft.dvtResolved,
      quantity: soft.quantity,
      productId: product?.id ?? null,
      productSlug: product?.slug ?? skuKeep,
      unitPrice: product?.price ?? 0,
      lineNotes: soft.lineNotes,
      errorNote: soft.lineNotes,
      stockQty,
      stockLabel,
      hasSoftError: soft.hasSoftError,
    });
  }

  const totalQty = lines.reduce((s, l) => s + (l.quantity || 0), 0);
  const warningCount = lines.filter((l) => l.hasSoftError).length;

  return {
    headerIndex,
    columns,
    lines,
    totalQty,
    skuSignature: buildOrderSkuSignature(skuQty),
    skippedJunk,
    skippedEmpty,
    hasError: warningCount > 0,
    warningCount,
  };
}

export interface BuildOrderInsertInput {
  loaiPhieu: PhieuLoai;
  warehouseId: string;
  sourceWarehouseId: string | null;
  customerName?: string;
  lines: ImportLineDraft[];
  now?: Date;
  duplicateAcknowledged?: boolean;
}

export function buildOrderInsertPayload(input: BuildOrderInsertInput) {
  const now = input.now || new Date();
  const inferred = inferPackingDayFromCreatedAt(now);
  // PRD: vẫn insert dòng qty=0 (Lỗi SL) — không filter bỏ
  const allLines = input.lines;
  const totalAmount = allLines.reduce(
    (s, l) => s + (l.unitPrice || 0) * l.quantity,
    0,
  );
  const orderCode = generateOrderCode(input.loaiPhieu);
  const hasError = allLines.some((l) => l.hasSoftError || !!l.lineNotes);

  const orderKind = input.loaiPhieu === "DonHang" ? "DH" : "DC";
  const orderRow = {
    order_code: orderCode,
    order_kind: orderKind,
    customer_name: input.customerName || "Import Excel",
    customer_phone: null as string | null,
    customer_address: null as string | null,
    warehouse_id: input.warehouseId,
    source_warehouse_id: input.sourceWarehouseId,
    packing_date: inferred.win.packingDayStr,
    packing_shift: inferred.mode === "supp" ? "supplement" : "main",
    status: "pending", // Mới
    total_amount: totalAmount,
    subtotal: totalAmount,
    shipping_fee: 0,
    is_free_shipping: true,
    notes: hasError
      ? "Import Excel — có dòng cần điều chỉnh (Lỗi SL/ĐVT/Mã)"
      : "Import Excel",
    has_error: hasError,
    duplicate_accepted: !!input.duplicateAcknowledged,
  };

  const itemRows = allLines.map((l) => ({
    product_name: l.tenHang,
    product_slug: l.productSlug,
    product_image: null as string | null,
    price: l.unitPrice || 0,
    quantity: l.quantity,
    qty_requested: l.quantity,
    qty_packed: null as number | null,
    qty_received: null as number | null,
    shipping_fee: 0,
    line_notes: l.lineNotes || null,
    barcode: l.maVach || null,
    unit: l.dvt || null,
  }));

  return { orderRow, itemRows, orderCode, hasErrors: hasError };
}
