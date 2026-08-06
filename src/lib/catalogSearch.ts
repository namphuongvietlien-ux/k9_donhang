/**
 * Gợi ý tìm SP — port GAS filterProducts / getSearchScore.
 * Ưu tiên mã hàng (slug) / Parent_SKU trước tên & mã vạch.
 */
import { normalizeOrderCodeText } from "@/lib/packingWindows";

export type CatalogSearchItem = {
  id: string;
  name: string;
  slug: string;
  barcode?: string | null;
  barcode_2?: string | null;
  unit?: string | null;
  parent_sku?: string | null;
};

function fold(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

/** Điểm khớp — mã hàng exact cao hơn mã vạch để ưu tiên hiện trước khi gõ MH */
export function scoreCatalogItem(p: CatalogSearchItem, q: string): number {
  if (!q) return 0;
  const qf = fold(q);
  const qc = normalizeOrderCodeText(q);
  if (!qc && !qf) return 0;

  const slug = normalizeOrderCodeText(p.slug);
  const parent = normalizeOrderCodeText(p.parent_sku || "");
  const barcode = normalizeOrderCodeText(p.barcode || "");
  const barcode2 = normalizeOrderCodeText(p.barcode_2 || "");
  const nameF = fold(p.name || "");

  let score = 0;

  // Mã hàng / Parent — ưu tiên tuyệt đối khi gõ MH
  if (slug && qc) {
    if (slug === qc) score = Math.max(score, 2200);
    else if (slug.startsWith(qc)) score = Math.max(score, 1800);
    else if (qc.length >= 4 && slug.includes(qc)) score = Math.max(score, 900);
  }
  if (parent && qc) {
    if (parent === qc) score = Math.max(score, 2000);
    else if (parent.startsWith(qc)) score = Math.max(score, 1600);
    else if (qc.length >= 4 && parent.includes(qc)) score = Math.max(score, 800);
  }

  // Mã vạch
  if (barcode && qc) {
    if (barcode === qc) score = Math.max(score, 2100);
    else if (qc.length >= 6 && barcode.startsWith(qc)) score = Math.max(score, 950);
    else if (qc.length >= 6 && barcode.endsWith(qc)) score = Math.max(score, 880);
    else if (qc.length >= 6 && barcode.includes(qc)) score = Math.max(score, 520);
  }
  if (barcode2 && qc) {
    if (barcode2 === qc) score = Math.max(score, 2050);
    else if (qc.length >= 6 && barcode2.includes(qc)) score = Math.max(score, 500);
  }

  // Tên
  if (qf && nameF) {
    if (nameF === qf) score = Math.max(score, 1000);
    else if (nameF.startsWith(qf)) score = Math.max(score, 650);
    else if (nameF.includes(qf)) score = Math.max(score, 280);
  }

  return score;
}

/**
 * GAS: nếu từ khóa là prefix mã SP / Parent → chỉ hiện family đó trước.
 */
export function filterCatalogSuggestions<T extends CatalogSearchItem>(
  catalog: T[],
  query: string,
  limit = 12,
): T[] {
  const q = String(query || "").trim();
  if (!q || !catalog.length) return [];

  const qc = normalizeOrderCodeText(q);
  const qf = fold(q);

  const codePrefixHits: T[] = [];
  if (qc.length >= 2) {
    for (const it of catalog) {
      const mh = normalizeOrderCodeText(it.slug);
      const parent = normalizeOrderCodeText(it.parent_sku || "");
      if (
        (mh && mh.startsWith(qc)) ||
        (parent && parent.startsWith(qc))
      ) {
        codePrefixHits.push(it);
      }
    }
  }

  const pool = codePrefixHits.length ? codePrefixHits : catalog;
  const scored = pool
    .map((it) => {
      let score = scoreCatalogItem(it, q);
      // Family theo mã: vẫn hiện dù điểm phụ thấp
      if (codePrefixHits.length && score <= 0) score = 700;
      return { it, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const sa = normalizeOrderCodeText(a.it.slug);
      const sb = normalizeOrderCodeText(b.it.slug);
      if (sa !== sb) return sa.localeCompare(sb, "en");
      return String(a.it.name || "").localeCompare(String(b.it.name || ""), "vi");
    });

  const seen = new Set<string>();
  const out: T[] = [];
  for (const { it } of scored) {
    const key = `${normalizeOrderCodeText(it.slug)}|${normalizeOrderCodeText(it.unit || "")}|${normalizeOrderCodeText(it.barcode || "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
    if (out.length >= limit) break;
  }

  // Fallback tên khi pool mã trống nhưng user gõ chữ
  if (!out.length && qf.length >= 2 && codePrefixHits.length === 0) {
    return catalog
      .map((it) => ({ it, score: scoreCatalogItem(it, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.it);
  }

  return out;
}
