/**
 * Phân nhóm SKU theo từ điển file SKU_moi_10_ky_tu.xlsx
 * Cấu trúc: [2 ngành][2 chi tiết][2 đối tượng][4 số]
 */

export type SkuIndustryCode =
  | "TA"
  | "VS"
  | "DC"
  | "YT"
  | "TT"
  | "PK"
  | "VT"
  | "DV";

export const SKU_INDUSTRIES: {
  code: SkuIndustryCode;
  label: string;
}[] = [
  { code: "TA", label: "Thức ăn" },
  { code: "VS", label: "Vệ sinh" },
  { code: "DC", label: "Đồ chơi" },
  { code: "YT", label: "Y tế / thuốc" },
  { code: "TT", label: "Thời trang" },
  { code: "PK", label: "Phụ kiện" },
  { code: "VT", label: "Vật tư phòng khám" },
  { code: "DV", label: "Dịch vụ" },
];

/** Cấp 2 — mã chi tiết theo ngành */
export const SKU_DETAILS: Record<SkuIndustryCode, { code: string; label: string }[]> = {
  TA: [
    { code: "HA", label: "Hạt / thức ăn khô" },
    { code: "PA", label: "Pate / thức ăn ướt" },
    { code: "XX", label: "Xúc xích" },
    { code: "SU", label: "Súp thưởng" },
    { code: "SN", label: "Snack / treat" },
    { code: "SM", label: "Sữa dinh dưỡng" },
    { code: "BS", label: "Thực phẩm bổ sung" },
  ],
  VS: [
    { code: "CV", label: "Cát vệ sinh" },
    { code: "ST", label: "Sữa tắm / dầu gội" },
    { code: "TL", label: "Tã / lót vệ sinh" },
    { code: "KV", label: "Khay / nhà vệ sinh" },
    { code: "KM", label: "Khử mùi / khăn" },
    { code: "DR", label: "Răng miệng" },
    { code: "NH", label: "Nước hoa thú cưng" },
    { code: "SK", label: "Sát khuẩn / khử trùng" },
    { code: "XE", label: "Xẻng / thảm cát" },
    { code: "VK", label: "Vệ sinh khác" },
  ],
  DC: [
    { code: "CQ", label: "Cần câu / teaser" },
    { code: "CO", label: "Cào / scratcher" },
    { code: "BO", label: "Bóng / fetch" },
    { code: "XK", label: "Đồ chơi khác" },
  ],
  YT: [
    { code: "TH", label: "Thuốc hỗ trợ / điều trị" },
    { code: "GI", label: "Trị giun / ve / bọ chét" },
    { code: "NA", label: "Trị nấm" },
    { code: "VI", label: "Kháng viêm / giảm đau" },
    { code: "KS", label: "Kháng sinh" },
    { code: "AN", label: "Gây mê / an thần" },
    { code: "VX", label: "Vắc xin" },
    { code: "QT", label: "Que test chẩn đoán" },
    { code: "DT", label: "Dịch truyền" },
    { code: "CC", label: "Cấp cứu" },
  ],
  TT: [
    { code: "AQ", label: "Áo quần" },
    { code: "NO", label: "Nón / mũ" },
    { code: "TV", label: "Tất / vớ" },
  ],
  PK: [
    { code: "DD", label: "Dây dắt" },
    { code: "VC", label: "Vòng cổ" },
    { code: "NE", label: "Nệm / ổ nằm" },
    { code: "BL", label: "Balo / túi vận chuyển" },
    { code: "RO", label: "Rọ mõm / loa chống liếm" },
    { code: "LO", label: "Lồng / chuồng" },
    { code: "BA", label: "Bát / dụng cụ ăn" },
    { code: "DI", label: "Địu thú cưng" },
    { code: "TG", label: "Túi / giỏ" },
    { code: "GR", label: "Dụng cụ grooming" },
    { code: "PX", label: "Phụ kiện khác" },
  ],
  VT: [
    { code: "BT", label: "Kim / bơm tiêm" },
    { code: "GT", label: "Găng tay" },
    { code: "CI", label: "Chỉ phẫu thuật" },
    { code: "LB", label: "Lab / hóa chất máy" },
    { code: "ON", label: "Ống / thông / nội khí quản" },
    { code: "PP", label: "Bộ phẫu thuật" },
    { code: "VP", label: "Văn phòng / tiêu hao" },
    { code: "VX", label: "Vật tư khác" },
  ],
  DV: [
    { code: "KC", label: "Khám / điều trị lâm sàng" },
    { code: "CD", label: "Chẩn đoán hình ảnh" },
    { code: "XN", label: "Xét nghiệm" },
    { code: "TP", label: "Tiêm phòng" },
    { code: "PS", label: "Phẫu thuật (dịch vụ)" },
    { code: "BN", label: "Lưu bệnh" },
    { code: "LC", label: "Lưu chuồng" },
    { code: "GG", label: "Grooming (dịch vụ)" },
    { code: "XG", label: "Xổ giun (dịch vụ)" },
    { code: "DX", label: "Dịch vụ khác" },
  ],
};

export const OTHER_INDUSTRY = "KHAC";

export function foldSkuCode(value?: string | null): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function isSkuIndustryCode(code: string): code is SkuIndustryCode {
  return SKU_INDUSTRIES.some((i) => i.code === code);
}

export function industryLabel(code?: string | null): string {
  const c = foldSkuCode(code).slice(0, 2);
  if (!c) return "Khác";
  return SKU_INDUSTRIES.find((i) => i.code === c)?.label || "Khác";
}

export function detailLabel(industry?: string | null, detail?: string | null): string {
  const ind = foldSkuCode(industry).slice(0, 2);
  const det = foldSkuCode(detail).slice(0, 2);
  if (!isSkuIndustryCode(ind) || !det) return det || "Khác";
  return SKU_DETAILS[ind].find((d) => d.code === det)?.label || det;
}

export type ResolvedSkuGroup = {
  industry: string;
  detail: string;
};

/** Ưu tiên cột DB; không có thì đọc 10 ký tự trên slug. */
export function resolveSkuGroup(input: {
  slug?: string | null;
  sku_industry?: string | null;
  sku_detail?: string | null;
}): ResolvedSkuGroup {
  const industry = foldSkuCode(input.sku_industry).slice(0, 2);
  const detail = foldSkuCode(input.sku_detail).slice(0, 2);
  if (industry) {
    if (!isSkuIndustryCode(industry)) {
      return { industry: OTHER_INDUSTRY, detail: "" };
    }
    return { industry, detail };
  }
  const slug = foldSkuCode(input.slug);
  if (/^[A-Z]{6}\d{4}$/.test(slug)) {
    return { industry: slug.slice(0, 2), detail: slug.slice(2, 4) };
  }
  return { industry: OTHER_INDUSTRY, detail: "" };
}

export function groupTitle(industry: string, detail: string): string {
  if (industry === OTHER_INDUSTRY || !industry) return "Khác";
  const head = `${industry} · ${industryLabel(industry)}`;
  if (!detail) return head;
  return `${head}  →  ${detail} · ${detailLabel(industry, detail)}`;
}

export function groupSortKey(industry: string, detail: string): string {
  const indIdx = SKU_INDUSTRIES.findIndex((i) => i.code === industry);
  const indOrder = indIdx < 0 ? 99 : indIdx;
  const details = isSkuIndustryCode(industry) ? SKU_DETAILS[industry] : [];
  const detIdx = details.findIndex((d) => d.code === detail);
  const detOrder = detIdx < 0 ? 99 : detIdx;
  return `${String(indOrder).padStart(2, "0")}-${industry}-${String(detOrder).padStart(2, "0")}-${detail}`;
}
