/**
 * Phân loại nhóm hàng theo quy ước mã SKU (SKU_mapping_HV_10ky_tu_v2.xlsx).
 *
 * Mã HV 10 ký tự = [1 loài C/M/H][2 nhóm HH][3 quy cách][4 số]. 6 chữ đầu là "nhóm HV",
 * phải có trong HV_GROUPS (sheet Ket_qua) mới được coi là "đúng quy ước".
 * Mã ngắn (TAC1001, TCN2011, KVS1001…) phân loại qua bảng ánh xạ mã ngắn → nhóm HV
 * (sheet Quy_tac_HV, bổ sung thêm các tiền tố có trong danh mục KiotViet).
 *
 * Quy tắc nhóm hàng (chốt 14/09/2026): chỉ ngành YT (y tế / thuốc, gồm ĐT điều trị,
 * CN thực phẩm chức năng) là THUOC; DV là DICH_VU; mọi ngành còn lại (TA, VS, DC, TT,
 * PK, VT vật tư) đều là HANG_HOA.
 */

import type { ProductCategoryGroup } from "@/lib/productCategory";
import { HV_GROUPS, type HvIndustryCode } from "@/lib/skuHvGroups";
import {
  OTHER_INDUSTRY,
  foldSkuCode,
  industryLabel,
  isSkuIndustryCode,
  parseHvSku,
} from "@/lib/skuGroups";

/** Nhóm hàng hóa (ký tự 2–3) hợp lệ theo sheet Quy_tac_HV */
export const HV_MERCH_CODES = [
  "TP",
  "CN",
  "CA",
  "PK",
  "ĐC",
  "DC",
  "VC",
  "VS",
  "ĐT",
  "VT",
  "DV",
] as const;

/**
 * Nhóm HH xuất hiện trong danh mục KiotViet nhưng CHƯA có trong Quy_tac_HV.
 * Tạm xếp ngành để phân loại hàng hóa / thuốc; vẫn báo "cần bổ sung quy ước".
 */
export const HV_MERCH_PROPOSED: Record<string, { industry: HvIndustryCode; note: string }> = {
  QT: { industry: "VT", note: "Que test / kit chẩn đoán (CQT…, HQT…, MQT…)" },
  KS: { industry: "VT", note: "Kháng sinh đồ (HKSĐ…) — quy ước hiện có là HVTKSĐ" },
  HC: { industry: "TA", note: "MHCTKM / CHCTKM — thức ăn (hàng combo / khuyến mãi?)" },
  TK: { industry: "VS", note: "CTKMTK — sữa tắm ST YÚ" },
  TH: { industry: "TA", note: "CTHPHU — snack Goodies" },
};

export type ShortCodeRule = {
  /** Nhóm HV 6 chữ đích (ưu tiên) */
  group?: string;
  /** Ngành khi không có nhóm 6 chữ tương ứng */
  industry?: HvIndustryCode;
  title: string;
  /** "quy_tac" = có trong sheet Quy_tac_HV; "danh_muc" = bổ sung từ danh mục 14/09/2026 */
  source: "quy_tac" | "danh_muc";
};

/**
 * Ánh xạ mã ngắn → nhóm HV. Khóa = phần chữ đầu mã (+ chữ số đầu nếu phân biệt,
 * vd. TAC1 hạt chó / TAC2 pate chó). Tra khóa dài trước, khóa ngắn sau.
 */
export const SHORT_CODE_MAP: Record<string, ShortCodeRule> = {
  // ── Sheet Quy_tac_HV: "Ánh xạ mã ngắn (Danh sách nhóm) → mã dài 6 chữ"
  TAC1: { group: "CTPCHI", title: "Thức ăn khô chó", source: "quy_tac" },
  TAM1: { group: "MTPCHI", title: "Thức ăn hạt mèo", source: "quy_tac" },
  TAC2: { group: "CTPPAT", title: "Pate / thức ăn ướt chó", source: "quy_tac" },
  TAM2: { group: "MTPPAT", title: "Pate / thức ăn ướt mèo", source: "quy_tac" },
  STC: { group: "CTPSUP", title: "Súp thưởng chó", source: "quy_tac" },
  STM: { group: "MTPSUP", title: "Súp thưởng mèo", source: "quy_tac" },
  SNC1: { group: "CTPSNK", title: "Snack chó", source: "quy_tac" },
  SNM: { group: "MTPSNK", title: "Bánh thưởng mèo", source: "quy_tac" },
  SCP: { group: "HTPMIL", title: "Sữa chó mèo", source: "quy_tac" },
  CVS: { group: "MCAXXX", title: "Cát vệ sinh", source: "quy_tac" },
  STP: { group: "HVSSTP", title: "Sữa tắm", source: "quy_tac" },
  KMP: { group: "HVSKMP", title: "Khử mùi", source: "quy_tac" },
  NHP: { group: "HVSNHP", title: "Nước hoa", source: "quy_tac" },
  TQP: { group: "HPKTBI", title: "Tã quần", source: "quy_tac" },
  TLP: { group: "HPKTBI", title: "Tã lót", source: "quy_tac" },
  KVS: { group: "HDCKVS", title: "Khay vệ sinh", source: "quy_tac" },
  LCP: { group: "HVCXXX", title: "Lồng vận chuyển", source: "quy_tac" },
  TVC: { group: "HVCXXX", title: "Túi vận chuyển", source: "quy_tac" },
  BLP: { group: "HPKBLO", title: "Balo", source: "quy_tac" },
  VAC1: { group: "HĐTVAC", title: "Vắc xin", source: "quy_tac" },
  VAC: { group: "HĐTVAC", title: "Vắc xin", source: "quy_tac" },
  TCN: { group: "HĐTTHT", title: "Thuốc hỗ trợ / TPCN", source: "quy_tac" },
  TKS: { group: "HĐTTKS", title: "Kháng sinh", source: "quy_tac" },
  XGP: { group: "HĐTXGP", title: "Xổ giun", source: "quy_tac" },
  KCB: { group: "HDVKCB", title: "Khám chữa bệnh (DV)", source: "quy_tac" },
  DLC: { group: "HDVDLC", title: "Lưu chuồng (DV)", source: "quy_tac" },
  GRM: { group: "HDVGRM", title: "Grooming / spa (DV)", source: "quy_tac" },
  XNP: { group: "HĐTXNP", title: "Xét nghiệm", source: "quy_tac" },
  XQP: { group: "HĐTXQP", title: "X-quang", source: "quy_tac" },
  SAP: { group: "HĐTSAP", title: "Siêu âm", source: "quy_tac" },
  PTP: { group: "HĐTPTP", title: "Phẫu thuật", source: "quy_tac" },

  // ── Bổ sung từ danh mục KiotViet 14/09/2026 (tiền tố chưa có trong Quy_tac_HV)
  SNC: { group: "CTPSNK", title: "Snack / xương gặm chó", source: "danh_muc" },
  SN: { group: "HTPSNK", title: "Snack sấy", source: "danh_muc" },
  TACM: { group: "MTPCHI", title: "Thức ăn hạt mèo", source: "danh_muc" },
  TAC: { group: "CTPCHI", title: "Thức ăn chó (khác 1/2)", source: "danh_muc" },
  TAM: { group: "MTPCHI", title: "Thức ăn mèo (khác 1/2)", source: "danh_muc" },
  PTT: { group: "HTPPAT", title: "Pate", source: "danh_muc" },
  HTK: { group: "HTPPAT", title: "Hàng tặng kèm (thức ăn)", source: "danh_muc" },
  VFS: { group: "HTPSNK", title: "Bánh nhai răng miệng (Veggiedent)", source: "danh_muc" },
  TTP: { group: "HPKAQU", title: "Áo quần thời trang", source: "danh_muc" },
  PKP: { industry: "PK", title: "Phụ kiện (khớp, khóa, linh kiện)", source: "danh_muc" },
  NCP: { group: "HPKNNE", title: "Nệm, thảm, nhà", source: "danh_muc" },
  TLCM: { group: "HPKNNE", title: "Thảm lông", source: "danh_muc" },
  VCP: { group: "HPKVCO", title: "Vòng cổ", source: "danh_muc" },
  DYP: { group: "HPKDAY", title: "Dây dắt yếm", source: "danh_muc" },
  DDP: { group: "HPKDAY", title: "Dây dắt dù", source: "danh_muc" },
  DDOP: { group: "HPKDAY", title: "Dây dắt hộp", source: "danh_muc" },
  DXC: { group: "HPKDAY", title: "Xích", source: "danh_muc" },
  NVS: { group: "MPKNVS", title: "Nhà vệ sinh mèo", source: "danh_muc" },
  DCP: { group: "HĐCXXX", title: "Đồ chơi", source: "danh_muc" },
  VSP: { group: "HVSMIE", title: "Vệ sinh răng miệng", source: "danh_muc" },
  KMX: { group: "HVSKMP", title: "Xịt khử mùi", source: "danh_muc" },
  KMG: { group: "HVSKMP", title: "Khăn ướt / khử mùi", source: "danh_muc" },
  KB: { group: "HVSSTP", title: "Sữa tắm (Bayopet)", source: "danh_muc" },
  TST: { group: "HVSTST", title: "Sát trùng (Vimekon)", source: "danh_muc" },
  ĐT: { group: "HDVKCB", title: "DV khám chữa bệnh", source: "danh_muc" },
  LC: { group: "HDVDLC", title: "DV lưu chuồng", source: "danh_muc" },
  GR: { group: "HDVGRM", title: "DV grooming", source: "danh_muc" },
  TGV: { group: "HĐTXGP", title: "Tẩy giun / ve", source: "danh_muc" },
  THT: { group: "HĐTTHT", title: "Thuốc thú y", source: "danh_muc" },
  TAN: { group: "HĐTTHT", title: "Viên bổ sung (Pet-ATP)", source: "danh_muc" },
  IT: { group: "HĐTXXX", title: "Itraconazole (trị nấm)", source: "danh_muc" },
  PD: { group: "HĐTTHT", title: "Prolax (dog)", source: "danh_muc" },
  PC: { group: "HĐTTHT", title: "Prolax (cat)", source: "danh_muc" },
  B: { group: "HĐTXXX", title: "Thuốc nhỏ (BIO-…)", source: "danh_muc" },
  TD: { group: "HĐTXXX", title: "Thuốc (Docanate…)", source: "danh_muc" },
  DTP: { group: "HĐTDTP", title: "Dịch truyền", source: "danh_muc" },
};

export type SkuConventionStatus =
  /** Mã HV, nhóm 6 chữ có trong quy ước */
  | "hv"
  /** Mã HV đúng cấu trúc nhưng nhóm 6 chữ chưa có trong quy ước → cần bổ sung */
  | "hv-unknown-group"
  /** Mã HV nhưng ký tự 2–3 không phải nhóm hàng hóa hợp lệ (có thể đã tạm xếp ngành) */
  | "hv-invalid-merch"
  /** Mã ngắn có trong bảng ánh xạ của sheet Quy_tac_HV */
  | "short"
  /** Mã ngắn ánh xạ tạm từ danh mục (chưa có trong Quy_tac_HV) → cần đưa vào quy ước */
  | "short-proposed"
  /** Mã ngắn chưa có trong bảng ánh xạ → cần bổ sung */
  | "short-unknown"
  /** Mã cũ [2 ngành][2 chi tiết][2 đối tượng][4 số] */
  | "legacy"
  /** Không theo quy ước nào (mã vạch, mã tự do…) */
  | "other";

export type SkuClassification = {
  status: SkuConventionStatus;
  /** 6 chữ đầu nếu là mã HV / nhóm HV đích của mã ngắn (giữ Đ) */
  hvGroup: string;
  /** Tên nhóm theo quy ước; rỗng nếu chưa có */
  groupTitle: string;
  /** Tiền tố mã ngắn khớp (nếu có) */
  shortPrefix: string;
  /** TA / VS / DC / YT / TT / PK / VT / DV / KHAC */
  industry: string;
  industryLabel: string;
  categoryGroup: ProductCategoryGroup | null;
  /** true khi mã đúng quy ước (status = "hv" hoặc "short" từ Quy_tac_HV) */
  inConvention: boolean;
  /** Cần bổ sung vào quy ước (nhóm HV mới, nhóm HH lạ, tiền tố ngắn mới) */
  needsConventionUpdate: boolean;
};

/** Nhóm HH (2 chữ, giữ Đ) → ngành */
export function hvMerchToIndustryCode(merch: string): HvIndustryCode {
  const m = merch.toUpperCase();
  if (m === "TP") return "TA";
  if (m === "CN") return "YT";
  if (m === "CA" || m === "VS") return "VS";
  if (m === "ĐC") return "DC";
  if (m === "DC" || m === "VC") return "PK";
  if (m === "PK") return "PK";
  if (m === "ĐT") return "YT";
  if (m === "VT") return "VT";
  if (m === "DV") return "DV";
  return HV_MERCH_PROPOSED[m]?.industry || "KHAC";
}

/** Ngành → nhóm hàng. Chỉ YT là thuốc; DV là dịch vụ; còn lại hàng hóa. */
export function categoryGroupFromIndustry(
  industry?: string | null,
): ProductCategoryGroup | null {
  const code = String(industry || "").trim().toUpperCase();
  if (!code || code === OTHER_INDUSTRY) return null;
  if (code === "YT") return "THUOC";
  if (code === "DV") return "DICH_VU";
  if (isSkuIndustryCode(code)) return "HANG_HOA";
  return null;
}

export function categoryGroupLabel(group: ProductCategoryGroup | null): string {
  if (group === "THUOC") return "Thuốc";
  if (group === "DICH_VU") return "Dịch vụ";
  if (group === "HANG_HOA") return "Hàng hóa";
  return "Chưa rõ";
}

/** Mã biến thể dạng `HPKAQU1001-01` → lấy phần gốc trước dấu `-` */
export function baseSkuOf(slug?: string | null): string {
  return String(slug || "")
    .trim()
    .split(/[-_/\s]/)[0]
    .normalize("NFC")
    .toUpperCase();
}

/** Tách phần chữ đầu (giữ Đ) và chữ số đầu của mã ngắn: TAC1001 → ["TAC", "1"] */
function splitShortCode(base: string): { letters: string; firstDigit: string } | null {
  const m = base.match(/^([A-Z\u0110]+)(\d)/);
  if (!m) return null;
  return { letters: m[1], firstDigit: m[2] };
}

function fromGroup(
  status: SkuConventionStatus,
  group6: string,
  shortPrefix: string,
  fallbackTitle: string,
  fallbackIndustry: HvIndustryCode,
  inConvention: boolean,
  needsConventionUpdate: boolean,
): SkuClassification {
  const meta = HV_GROUPS[group6];
  const industry = meta?.industry || fallbackIndustry;
  return {
    status,
    hvGroup: group6,
    groupTitle: meta?.title || fallbackTitle,
    shortPrefix,
    industry,
    industryLabel: industryLabel(industry),
    categoryGroup: categoryGroupFromIndustry(industry),
    inConvention,
    needsConventionUpdate,
  };
}

export function classifySkuByConvention(slug?: string | null): SkuClassification {
  const base = baseSkuOf(slug);

  // 1) Mã HV 10 ký tự chuẩn
  const hv = parseHvSku(base);
  if (hv) {
    if (HV_GROUPS[hv.group6]) {
      return fromGroup("hv", hv.group6, "", "", "KHAC", true, false);
    }
    const merchOk = (HV_MERCH_CODES as readonly string[]).includes(hv.merch);
    const industry = merchOk
      ? hvMerchToIndustryCode(hv.merch)
      : HV_MERCH_PROPOSED[hv.merch]?.industry || OTHER_INDUSTRY;
    return {
      status: merchOk ? "hv-unknown-group" : "hv-invalid-merch",
      hvGroup: hv.group6,
      groupTitle: "",
      shortPrefix: "",
      industry,
      industryLabel: industryLabel(industry),
      categoryGroup: categoryGroupFromIndustry(industry),
      inConvention: false,
      needsConventionUpdate: true,
    };
  }

  // 2) Cấu trúc HV nhưng phần số lệch quy ước (CQTMT40000 5 số, HVTGTXCB01 thêm chữ)
  const head6 = base.slice(0, 6);
  const relaxed = base.match(/^([CMH])([A-Z\u0110]{2})([A-Z\u0110]{3})\d{4,}$/);
  if (relaxed) {
    const merch = relaxed[2];
    const merchOk = (HV_MERCH_CODES as readonly string[]).includes(merch);
    const industry = HV_GROUPS[head6]?.industry
      || (merchOk ? hvMerchToIndustryCode(merch) : HV_MERCH_PROPOSED[merch]?.industry || OTHER_INDUSTRY);
    return {
      status: merchOk || HV_GROUPS[head6] ? "hv-unknown-group" : "hv-invalid-merch",
      hvGroup: head6,
      groupTitle: HV_GROUPS[head6]?.title || "",
      shortPrefix: "",
      industry,
      industryLabel: industryLabel(industry),
      categoryGroup: categoryGroupFromIndustry(industry),
      inConvention: false,
      needsConventionUpdate: true,
    };
  }
  if (/^[CMH][A-Z\u0110]{5}$/.test(head6) && HV_GROUPS[head6] && /\d/.test(base.slice(6))) {
    return fromGroup("hv-unknown-group", head6, "", "", "KHAC", false, true);
  }

  // 3) Mã ngắn theo bảng ánh xạ
  const sc = splitShortCode(base);
  if (sc) {
    const rule =
      SHORT_CODE_MAP[`${sc.letters}${sc.firstDigit}`] || SHORT_CODE_MAP[sc.letters];
    if (rule) {
      const prefix = SHORT_CODE_MAP[`${sc.letters}${sc.firstDigit}`]
        ? `${sc.letters}${sc.firstDigit}`
        : sc.letters;
      const status: SkuConventionStatus =
        rule.source === "quy_tac" ? "short" : "short-proposed";
      if (rule.group) {
        return fromGroup(
          status,
          rule.group,
          prefix,
          rule.title,
          rule.industry || "KHAC",
          rule.source === "quy_tac",
          rule.source !== "quy_tac",
        );
      }
      const industry = rule.industry || "KHAC";
      return {
        status,
        hvGroup: "",
        groupTitle: rule.title,
        shortPrefix: prefix,
        industry,
        industryLabel: industryLabel(industry),
        categoryGroup: categoryGroupFromIndustry(industry),
        inConvention: rule.source === "quy_tac",
        needsConventionUpdate: rule.source !== "quy_tac",
      };
    }
  }

  // 4) Mã cũ 2+2+2+4
  const folded = foldSkuCode(base);
  if (/^[A-Z]{6}\d{4}$/.test(folded)) {
    const ind = folded.slice(0, 2);
    if (isSkuIndustryCode(ind)) {
      return {
        status: "legacy",
        hvGroup: "",
        groupTitle: "",
        shortPrefix: "",
        industry: ind,
        industryLabel: industryLabel(ind),
        categoryGroup: categoryGroupFromIndustry(ind),
        inConvention: false,
        needsConventionUpdate: false,
      };
    }
  }

  // 5) Mã ngắn chưa có trong bảng ánh xạ (có chữ + số) — cần bổ sung
  if (sc && sc.letters.length <= 5) {
    return {
      status: "short-unknown",
      hvGroup: "",
      groupTitle: "",
      shortPrefix: sc.letters,
      industry: OTHER_INDUSTRY,
      industryLabel: "Khác",
      categoryGroup: null,
      inConvention: false,
      needsConventionUpdate: true,
    };
  }

  return {
    status: "other",
    hvGroup: "",
    groupTitle: "",
    shortPrefix: "",
    industry: OTHER_INDUSTRY,
    industryLabel: "Khác",
    categoryGroup: null,
    inConvention: false,
    needsConventionUpdate: false,
  };
}

export type ConventionGap = {
  /** Nhóm HV 6 chữ hoặc tiền tố mã ngắn */
  key: string;
  status: SkuConventionStatus;
  /** Ngành suy ra (nếu có) */
  industry: string;
  categoryGroup: ProductCategoryGroup | null;
  count: number;
  samples: { sku: string; name: string }[];
};

export function conventionStatusLabel(status: SkuConventionStatus): string {
  switch (status) {
    case "hv":
      return "Đúng quy ước HV";
    case "hv-unknown-group":
      return "Nhóm HV 6 chữ chưa có trong quy ước";
    case "hv-invalid-merch":
      return "Nhóm HH (ký tự 2–3) ngoài quy ước";
    case "short":
      return "Mã ngắn (Quy_tac_HV)";
    case "short-proposed":
      return "Mã ngắn mới — tạm ánh xạ, cần đưa vào Quy_tac_HV";
    case "short-unknown":
      return "Tiền tố mã ngắn chưa có ánh xạ";
    case "legacy":
      return "Mã cũ 2+2+2+4";
    default:
      return "Không theo quy ước";
  }
}

/**
 * Gom các mã cần bổ sung quy ước (nhóm HV mới, nhóm HH lạ, tiền tố ngắn mới hoặc
 * mới bổ sung từ danh mục) — dùng để cập nhật HV_GROUPS / sheet Ket_qua / Quy_tac_HV.
 */
export function findConventionGaps(
  rows: { sku: string; name?: string | null }[],
  maxSamples = 5,
): ConventionGap[] {
  const map = new Map<string, ConventionGap>();
  for (const r of rows) {
    const c = classifySkuByConvention(r.sku);
    if (!c.needsConventionUpdate) continue;
    const key = c.shortPrefix || c.hvGroup;
    if (!key) continue;
    let gap = map.get(key);
    if (!gap) {
      gap = {
        key,
        status: c.status,
        industry: c.industry,
        categoryGroup: c.categoryGroup,
        count: 0,
        samples: [],
      };
      map.set(key, gap);
    }
    gap.count += 1;
    if (gap.samples.length < maxSamples) {
      gap.samples.push({ sku: baseSkuOf(r.sku), name: String(r.name || "") });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/** CSV để dán vào sheet Ket_qua / Quy_tac_HV hoặc gửi người quản lý quy ước */
export function conventionGapsToCsv(gaps: ConventionGap[]): string {
  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ["Mã nhóm / tiền tố", "Tình trạng", "Ngành suy ra", "Nhóm hàng", "Số mã", "Mã ví dụ", "Tên ví dụ"]
      .map(esc)
      .join(","),
  ];
  for (const g of gaps) {
    lines.push(
      [
        g.key,
        conventionStatusLabel(g.status),
        g.industry,
        categoryGroupLabel(g.categoryGroup),
        String(g.count),
        g.samples.map((s) => s.sku).join(" | "),
        g.samples.map((s) => s.name).join(" | "),
      ]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n");
}
