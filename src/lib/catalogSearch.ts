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

/**
 * Độ dài tối thiểu để cho phép khớp TIỀN TỐ mã vạch.
 * Ngắn hơn (VD "8850") thì gần như mọi mã vạch VN đều khớp → vô nghĩa.
 */
const BARCODE_PREFIX_MIN = 6;

/**
 * Mã vạch chỉ được khớp TUYỆT ĐỐI hoặc TỪ KÝ TỰ ĐẦU.
 *
 * Trước đây còn hai nhánh `barcode.endsWith(qc)` (880đ) và
 * `barcode.includes(qc)` (520đ) — đây chính là nguyên nhân "gõ mã này ra sản
 * phẩm khác": một đoạn số nằm ở GIỮA hoặc ĐUÔI mã vạch dài của SP khác vẫn
 * được tính điểm, leo lên đầu gợi ý, thậm chí bị auto-add khi chỉ còn 1 dòng.
 */
function scoreBarcode(
  barcode: string,
  qc: string,
  exact: number,
  prefix: number,
): number {
  if (!barcode || !qc) return 0;
  if (barcode === qc) return exact;
  if (qc.length >= BARCODE_PREFIX_MIN && barcode.startsWith(qc)) return prefix;
  return 0;
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

  // Mã vạch — CHỈ exact hoặc prefix (xem scoreBarcode)
  score = Math.max(score, scoreBarcode(barcode, qc, 2100, 950));
  score = Math.max(score, scoreBarcode(barcode2, qc, 2050, 930));

  // Tên — với chuỗi số dài (rõ ràng là mã vạch quét vào) KHÔNG khớp lỏng theo
  // tên, vì một dãy số trùng trong tên SP khác sẽ thành gợi ý duy nhất và bị
  // tự động thêm dòng.
  if (qf && nameF) {
    const scannedNumeric = qc.length >= BARCODE_PREFIX_MIN && /^[0-9]+$/.test(qc);
    if (nameF === qf) score = Math.max(score, 1000);
    else if (nameF.startsWith(qf)) score = Math.max(score, 650);
    else if (!scannedNumeric && nameF.includes(qf)) score = Math.max(score, 280);
  }

  return score;
}

export type CatalogScanResolution<T> = {
  /** Dòng danh mục khớp tuyệt đối — null khi không có hoặc nhập nhằng */
  hit: T | null;
  /** true = mã vạch đang gắn cho nhiều mã hàng khác nhau → phải chọn tay */
  ambiguous: boolean;
  /** Danh sách mã hàng cùng dùng mã vạch đó (chỉ có khi ambiguous) */
  skus: string[];
};

/**
 * Giải mã một lần quét / một lần Enter thành đúng 1 dòng danh mục.
 *
 * Thứ tự bắt buộc (dùng chung cho MỌI form, tránh mỗi nơi tự vá một kiểu rồi
 * lệch nhau):
 *  1. Mã hàng (slug) khớp tuyệt đối — slug là định danh duy nhất nên thắng
 *     mã vạch. Nhiều dòng cùng slug chỉ là nhiều ĐVT → lấy dòng đầu.
 *  2. Mã vạch / mã vạch 2 khớp tuyệt đối. Danh mục hiện có nhiều mã vạch bị
 *     gắn cho >1 mã hàng (VD 8850477016996 → TAC1073 và CTPCHI1035) → KHÔNG
 *     đoán hộ, trả ambiguous để UI bắt người dùng chọn.
 *  3. Không khớp gì → hit = null (form tự xử: gợi ý hoặc tạo mã mới).
 *
 * Không có nhánh nào dùng includes/endsWith trên mã vạch.
 */
export function resolveCatalogScan<T extends CatalogSearchItem>(
  catalog: T[],
  query: string,
): CatalogScanResolution<T> {
  const empty: CatalogScanResolution<T> = { hit: null, ambiguous: false, skus: [] };
  const qc = normalizeOrderCodeText(String(query || "").trim());
  if (!qc || !catalog?.length) return empty;

  const bySlug = catalog.filter((p) => normalizeOrderCodeText(p.slug) === qc);
  if (bySlug.length) return { hit: bySlug[0], ambiguous: false, skus: [] };

  const byBarcode = catalog.filter(
    (p) =>
      normalizeOrderCodeText(p.barcode || "") === qc ||
      normalizeOrderCodeText(p.barcode_2 || "") === qc,
  );
  if (!byBarcode.length) return empty;

  const skus = [...new Set(byBarcode.map((p) => normalizeOrderCodeText(p.slug)))];
  if (skus.length > 1) return { hit: null, ambiguous: true, skus };
  return { hit: byBarcode[0], ambiguous: false, skus };
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
