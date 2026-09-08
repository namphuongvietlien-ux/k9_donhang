/**
 * Phân nhóm SKU:
 * - HV 10 ký tự (Ket_qua): [1 loài C/M/H][2 nhóm HH][3 quy cách][4 số]
 * - Cũ: [2 ngành][2 chi tiết][2 đối tượng][4 số]
 */

import { needsTpcnThuocMove } from "@/lib/tpcnClassify";
import { HV_GROUPS, type HvIndustryCode } from "@/lib/skuHvGroups";

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
    { code: "CN", label: "Thực phẩm chức năng / TPCN" },
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
  /** 6 chữ HV (CTPCHI, MCAXXX…) — rỗng nếu không phải mã HV */
  hvGroup: string;
};

const HV_SKU_RE =
  /^([CMH])([A-Z\u0110]{2})([A-Z\u0110]{3})(\d{4})$/i;

function hvMerchToIndustry(merch: string, spec: string): HvIndustryCode {
  const m = merch.toUpperCase();
  const s = spec.toUpperCase();
  if (m === "TP") return "TA";
  if (m === "CN") return "YT";
  if (m === "CA" || m === "VS") return "VS";
  if (m === "ĐC") return "DC";
  if (m === "DC") return "PK";
  if (m === "PK") {
    if (s === "AQU" || s === "TTR" || s === "GIY") return "TT";
    return "PK";
  }
  if (m === "VC") return "PK";
  if (m === "ĐT" || m === "DT") return "YT";
  if (m === "VT") return "VT";
  if (m === "DV") return "DV";
  return "KHAC";
}

/** Giữ chữ Đ (đồ chơi / điều trị) — không gộp với D (dụng cụ). */
export function parseHvSku(slug?: string | null): {
  group6: string;
  species: string;
  merch: string;
  spec: string;
} | null {
  const raw = String(slug || "")
    .trim()
    .normalize("NFC")
    .toUpperCase();
  const m = raw.match(HV_SKU_RE);
  if (!m) return null;
  return {
    group6: `${m[1]}${m[2]}${m[3]}`.toUpperCase(),
    species: m[1].toUpperCase(),
    merch: m[2].toUpperCase(),
    spec: m[3].toUpperCase(),
  };
}

export function hvGroupMeta(group6?: string | null) {
  if (!group6) return null;
  return HV_GROUPS[group6] || null;
}

export function hvGroupsForIndustry(industry: string): {
  code: string;
  label: string;
}[] {
  return Object.entries(HV_GROUPS)
    .filter(([, meta]) => meta.industry === industry)
    .map(([code, meta]) => ({ code, label: meta.title }))
    .sort((a, b) => a.code.localeCompare(b.code, "vi"));
}

/** Ưu tiên cột DB hợp lệ; không thì đọc SKU HV 10 ký tự (Ket_qua), rồi schema cũ. */
export function resolveSkuGroup(input: {
  slug?: string | null;
  name?: string | null;
  sku_industry?: string | null;
  sku_detail?: string | null;
  category_group?: string | null;
}): ResolvedSkuGroup {
  const hv = parseHvSku(input.slug);
  const hvGroup = hv?.group6 || "";

  if (needsTpcnThuocMove(input)) {
    return { industry: "YT", detail: "CN", hvGroup };
  }

  const industry = foldSkuCode(input.sku_industry).slice(0, 2);
  const detail = foldSkuCode(input.sku_detail).slice(0, 2);
  if (industry && isSkuIndustryCode(industry)) {
    return { industry, detail, hvGroup };
  }

  if (hv) {
    const meta = hvGroupMeta(hv.group6);
    const mapped = meta?.industry || hvMerchToIndustry(hv.merch, hv.spec);
    return {
      industry: mapped === "KHAC" || !isSkuIndustryCode(mapped) ? OTHER_INDUSTRY : mapped,
      detail: hv.spec,
      hvGroup: hv.group6,
    };
  }

  const slug = foldSkuCode(input.slug);
  if (/^[A-Z]{6}\d{4}$/.test(slug)) {
    const ind = slug.slice(0, 2);
    const det = slug.slice(2, 4);
    if (isSkuIndustryCode(ind)) {
      return { industry: ind, detail: det, hvGroup: "" };
    }
  }
  return { industry: OTHER_INDUSTRY, detail: "", hvGroup: "" };
}

export function groupTitle(
  industry: string,
  detail: string,
  hvGroup?: string,
): string {
  if (hvGroup) {
    const meta = hvGroupMeta(hvGroup);
    if (meta?.title) return `${hvGroup} · ${meta.title}`;
    return hvGroup;
  }
  if (industry === OTHER_INDUSTRY || !industry) return "Khác";
  const head = `${industry} · ${industryLabel(industry)}`;
  if (!detail) return head;
  return `${head}  →  ${detail} · ${detailLabel(industry, detail)}`;
}

export function groupSortKey(
  industry: string,
  detail: string,
  hvGroup?: string,
): string {
  const indIdx = SKU_INDUSTRIES.findIndex((i) => i.code === industry);
  const indOrder = indIdx < 0 ? 99 : indIdx;
  const extra = hvGroup || detail || "";
  const details = isSkuIndustryCode(industry) ? SKU_DETAILS[industry] : [];
  const detIdx = details.findIndex((d) => d.code === detail);
  const detOrder = hvGroup ? 0 : detIdx < 0 ? 99 : detIdx;
  return `${String(indOrder).padStart(2, "0")}-${industry}-${String(detOrder).padStart(2, "0")}-${extra}`;
}
