/**
 * Đồng bộ ĐVT ↔ mã vạch cho dòng đơn / XB — gom logic trùng Create & BanKem.
 * Không đổi rule nghiệp vụ: đổi ĐVT → buộc sync barcode (kể cả rỗng).
 */
import { useMemo } from "react";
import {
  buildSkuUnitIndex,
  expandProductUnitOptions,
  getSkuUnitOptions,
  resolveAvailableVariants,
  resolveUnitOption,
  type CatalogProductRow,
  type SkuUnitOption,
} from "@/lib/catalogUnitBarcode";
import { normalizeOrderCodeText } from "@/lib/packingWindows";

export type DraftLineUnitFields = {
  maHang: string;
  dvt: string;
  maVach: string;
  unitOptions: SkuUnitOption[];
  productId?: string | null;
  price?: number;
  unitPrice?: number;
  serviceFee?: number;
  stockQty?: number | null;
  lineKind?: string;
};

export type SyncDraftLineUnitOptions = {
  skuUnitIndex: Map<string, SkuUnitOption[]>;
  /** Tồn theo ĐVT mới (Create form) */
  getStockQty?: (maHang: string, unit: string) => number | null | undefined;
  /** BanKem: cập nhật giá theo HANG/DV */
  syncPriceByLineKind?: boolean;
};

/**
 * Áp ĐVT mới lên 1 dòng draft — giữ mã hàng + tên; sync MV bắt buộc.
 */
export function syncDraftLineUnit<T extends DraftLineUnitFields>(
  line: T,
  dvt: string,
  opts: SyncDraftLineUnitOptions,
): T {
  const liveOpts = getSkuUnitOptions(opts.skuUnitIndex, line.maHang);
  const options = liveOpts.length > 0 ? liveOpts : line.unitOptions;

  if (!options.length) {
    return { ...line, dvt };
  }

  const match = resolveUnitOption(options, dvt);
  if (!match) {
    return { ...line, dvt, maVach: "", unitOptions: options };
  }

  const next: T = {
    ...line,
    dvt: match.unit,
    maVach: String(match.barcode ?? "").trim(),
    unitOptions: options,
  };

  if (line.productId !== undefined) {
    next.productId = match.productId;
  }
  if (opts.getStockQty) {
    next.stockQty =
      opts.getStockQty(line.maHang, match.unit) ?? line.stockQty ?? null;
  }

  if (opts.syncPriceByLineKind) {
    if (line.lineKind === "HANG") {
      next.unitPrice = match.price || line.unitPrice;
    } else if (line.lineKind === "DV") {
      next.serviceFee = match.price || line.serviceFee;
    }
  } else if (line.price !== undefined) {
    next.price = match.price || line.price;
  }

  return next;
}

export type PickUnitResult = {
  slug: string;
  name: string;
  unit: string;
  barcode: string;
  price: number;
  productId: string;
  unitOptions: SkuUnitOption[];
};

/** Chọn ĐVT/MV từ catalog khi pick SP (Create / Detail / BanKem). */
export function pickUnitFromCatalog(
  product: CatalogProductRow & { name: string; price?: number | null },
  catalog: CatalogProductRow[],
  preferredBarcode?: string | null,
): PickUnitResult {
  const slug = normalizeOrderCodeText(product.slug);
  const opts = resolveAvailableVariants(catalog, slug);
  const unitOpts =
    opts.length > 0 ? opts : expandProductUnitOptions(product);
  const bcPref = normalizeOrderCodeText(preferredBarcode || "");
  const match =
    unitOpts.find(
      (o) => bcPref && normalizeOrderCodeText(o.barcode) === bcPref,
    ) ||
    unitOpts[0] ||
    null;

  return {
    slug,
    name: product.name,
    unit: match?.unit || product.unit || "cái",
    barcode: match?.barcode || product.barcode || "",
    price: match?.price ?? Number(product.price) || 0,
    productId: match?.productId || product.id,
    unitOptions: unitOpts,
  };
}

export function useSkuUnitIndex(catalog: CatalogProductRow[] | undefined | null) {
  return useMemo(
    () => buildSkuUnitIndex(catalog || []),
    [catalog],
  );
}
