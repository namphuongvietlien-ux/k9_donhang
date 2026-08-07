/**
 * Key tồn kho — khớp GAS addStockValueByCode / lookupStockByPrefixCode_:
 * mã (MH/MV) + |DV:đvt_chuẩn
 */

import { normalizeOrderCodeText } from "@/lib/packingWindows";
import { normalizeUnitKey } from "@/lib/softLineValidation";

export { normalizeUnitKey };

/** Suffix ĐVT cho composite key (vd `|DV:cai`) — rỗng nếu không có ĐVT */
export function stockUnitSuffix(unit: string | null | undefined): string {
  const u = normalizeUnitKey(unit);
  return u ? `|DV:${u}` : "";
}

/** Composite key: CODE hoặc CODE|DV:unit */
export function stockCompositeKey(
  code: string | null | undefined,
  unit?: string | null,
): string {
  const c = normalizeOrderCodeText(code || "");
  if (!c) return "";
  return c + stockUnitSuffix(unit);
}

/** unit_key lưu DB (không dấu, lower, không khoảng trắng) */
export function toStockUnitKey(unit: string | null | undefined): string {
  return normalizeUnitKey(unit) || "cai";
}

/** Nhãn ĐVT hiển thị khi import (fallback cái) */
export function displayStockUnit(unit: string | null | undefined): string {
  const raw = String(unit || "").trim();
  return raw || "cái";
}
