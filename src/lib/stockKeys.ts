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

/**
 * Chuẩn hóa một composite key đã dựng sẵn.
 *
 * QUAN TRỌNG: chỉ upper-case phần MÃ, giữ nguyên phần `|DV:<unit>` (luôn
 * lowercase theo normalizeUnitKey). Nếu áp normalizeOrderCodeText lên cả chuỗi
 * thì key ghi vào map thành `CODE|DV:HOP` còn key tra cứu là `CODE|DV:hop`,
 * làm MỌI lần tra tồn theo ĐVT bị miss rồi rơi xuống fallback ĐVT cơ sở.
 */
export function normalizeStockCompositeKey(key: string | null | undefined): string {
  const raw = String(key ?? "").trim();
  if (!raw) return "";
  const at = raw.indexOf("|DV:");
  if (at < 0) return normalizeOrderCodeText(raw);
  const code = normalizeOrderCodeText(raw.slice(0, at));
  if (!code) return "";
  return code + stockUnitSuffix(raw.slice(at + 4));
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
