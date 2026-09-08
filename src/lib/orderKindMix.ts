/**
 * DH chỉ hàng hóa; DT chỉ thuốc. Không trộn trên cùng một phiếu.
 */

import { isMedicineProduct } from "@/lib/productCategory";
import { phieuLoaiToKind, type PhieuLoai } from "@/lib/importOrders";
import type { OrderKind } from "@/lib/warehouseOrders";

export const ORDER_KIND_MIX_MESSAGE =
  "Không được trộn lẫn! Vui lòng nhập thuốc và hàng hóa riêng biệt";

export type MixProductHint = {
  category_group?: string | null;
  sku_industry?: string | null;
  sku_detail?: string | null;
  slug?: string | null;
  name?: string | null;
};

function hasCategorySignal(p: MixProductHint | null | undefined): boolean {
  if (!p) return false;
  if (String(p.category_group || "").trim()) return true;
  if (String(p.sku_industry || "").trim()) return true;
  return isMedicineProduct(p);
}

export function lineFitsOrderKind(
  kind: string | null | undefined,
  product: MixProductHint | null | undefined,
): boolean {
  if (kind !== "DH" && kind !== "DT") return true;
  if (!hasCategorySignal(product)) return true;
  const med = isMedicineProduct(product);
  if (kind === "DH") return !med;
  return med;
}

export function assertLineFitsOrderKind(
  kind: string | null | undefined,
  product: MixProductHint | null | undefined,
): { ok: true } | { ok: false; message: string } {
  if (lineFitsOrderKind(kind, product)) return { ok: true };
  return { ok: false, message: ORDER_KIND_MIX_MESSAGE };
}

export function kindFromPhieuLoai(loai: PhieuLoai): OrderKind {
  return phieuLoaiToKind(loai);
}

export function notifyOrderKindMixBlocked(): void {
  if (typeof window === "undefined") return;
  window.alert(ORDER_KIND_MIX_MESSAGE);
}

export function isSttLockedOrder(order: {
  stt_locked_at?: string | null;
  printed_at?: string | null;
  is_locked?: boolean | null;
}): boolean {
  return !!(order.stt_locked_at || order.printed_at || order.is_locked);
}
