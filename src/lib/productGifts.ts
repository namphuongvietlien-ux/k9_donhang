import { normalizeOrderCodeText } from "@/lib/packingWindows";
import type { GiftLimitKind, ProductGiftRule } from "@/hooks/useProductGifts";

export function vnTodayYmd(at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(at);
}

function ymdToDmy(ymd?: string | null): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

export function giftRemainingQty(rule: ProductGiftRule): number | null {
  const kind = rule.limit_kind || "long_term";
  if (kind !== "qty_limit" || rule.max_total_qty == null) return null;
  const max = Number(rule.max_total_qty);
  const used = Number(rule.used_qty) || 0;
  if (!Number.isFinite(max)) return null;
  return Math.max(0, Math.round((max - used) * 1000) / 1000);
}

export function isGiftRuleLive(rule: ProductGiftRule, at = new Date()): boolean {
  if (rule.is_active === false) return false;
  const kind: GiftLimitKind = rule.limit_kind || "long_term";
  if (kind === "timeline") {
    const today = vnTodayYmd(at);
    if (rule.starts_on && today < rule.starts_on) return false;
    if (rule.ends_on && today > rule.ends_on) return false;
  }
  if (kind === "qty_limit") {
    const remain = giftRemainingQty(rule);
    if (remain != null && remain <= 0) return false;
  }
  return true;
}

export function formatGiftLimitLabel(rule: ProductGiftRule): string {
  const kind: GiftLimitKind = rule.limit_kind || "long_term";
  if (kind === "timeline") {
    const from = ymdToDmy(rule.starts_on);
    const to = ymdToDmy(rule.ends_on);
    if (from && to) return `${from} → ${to}`;
    if (from) return `Từ ${from}`;
    if (to) return `Đến ${to}`;
    return "Theo ngày";
  }
  if (kind === "qty_limit") {
    const max = Number(rule.max_total_qty);
    const used = Number(rule.used_qty) || 0;
    if (!Number.isFinite(max)) return "Giới hạn SL";
    return `Còn ${Math.max(0, max - used)}/${max}`;
  }
  return "Dài hạn";
}

export function matchingGiftRules(
  rules: ProductGiftRule[],
  main: { id?: string | null; slug?: string | null },
): ProductGiftRule[] {
  const slug = normalizeOrderCodeText(main.slug || "");
  return (rules || []).filter((rule) => {
    if (!isGiftRuleLive(rule)) return false;
    if (main.id && rule.main_product_id === main.id) return true;
    const ruleSlug = normalizeOrderCodeText(rule.main?.slug || "");
    return !!slug && !!ruleSlug && slug === ruleSlug;
  });
}

export function giftLineQuantity(mainQty: number, ruleQty: number): number {
  const qty = (Number(mainQty) || 0) * (Number(ruleQty) || 0);
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  return Math.round(qty * 1000) / 1000;
}

export type GiftLineSeed = {
  ruleId: string;
  giftProductId: string;
  slug: string;
  name: string;
  unit: string;
  quantity: number;
};

export function giftSeedsForMain(
  rules: ProductGiftRule[],
  main: { id?: string | null; slug?: string | null; quantity: number },
): GiftLineSeed[] {
  const seeds: GiftLineSeed[] = [];
  for (const rule of matchingGiftRules(rules, main)) {
    const slug = normalizeOrderCodeText(rule.gift?.slug || "");
    let quantity = giftLineQuantity(main.quantity, rule.quantity);
    const remain = giftRemainingQty(rule);
    if (remain != null) quantity = Math.min(quantity, remain);
    if (!slug || quantity <= 0) continue;
    seeds.push({
      ruleId: rule.id,
      giftProductId: rule.gift_product_id,
      slug,
      name: rule.gift?.name || slug,
      unit: rule.gift?.unit || "cái",
      quantity,
    });
  }
  return seeds;
}

/** Giữ dòng chính, gắn lại toàn bộ dòng tặng kèm theo quy tắc (1 cấp). */
export function attachGiftLines<T>(
  lines: T[],
  rules: ProductGiftRule[],
  opts: {
    isGift: (line: T) => boolean;
    mainOf: (line: T) => {
      id?: string | null;
      slug?: string | null;
      quantity: number;
    };
    makeGift: (main: T, seed: GiftLineSeed) => T;
  },
): T[] {
  const mains = lines.filter((line) => !opts.isGift(line));
  const out: T[] = [];
  for (const main of mains) {
    out.push(main);
    for (const seed of giftSeedsForMain(rules, opts.mainOf(main))) {
      out.push(opts.makeGift(main, seed));
    }
  }
  return out;
}
