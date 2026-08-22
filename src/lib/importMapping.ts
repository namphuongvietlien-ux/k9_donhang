/**
 * Port from GAS utils_helpers.gs — import header mapping / junk rows / qty parse.
 * Used by DataImport for Excel/CSV → order lines.
 */

export type ImportRole =
  | "maHang"
  | "maVach"
  | "tenHang"
  | "dvt"
  | "dvt2"
  | "parentSku"
  | "tonKho"
  | "soLuong";

export interface ImportColumnMap {
  maHang: number;
  maVach: number;
  tenHang: number;
  dvt: number;
  dvt2: number;
  parentSku: number;
  tonKho: number;
  soLuong: number;
  labels: Partial<Record<ImportRole, string>>;
  scores: Partial<Record<ImportRole, number>>;
}

export function normalizeHeaderText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .trim()
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * "Tỷ lệ quy đổi" (KiotViet cột T) là SỐ, không phải tên ĐVT.
 * Không tách riêng thì `dvt2` ăn điểm 100 vì chứa "quydoi" → ghi 10/30 vào unit_2.
 */
export function isImportRatioHeaderNorm(norm: string): boolean {
  if (!norm) return false;
  return norm.includes("tyle") || norm.includes("tile");
}

function isImportDvt2HeaderNorm(norm: string): boolean {
  if (!norm) return false;
  if (isImportRatioHeaderNorm(norm)) return false;
  if (norm === "dvt2" || norm === "donvi2" || norm === "unit2" || norm === "altunit") return true;
  if (norm.indexOf("quydoi") !== -1) return true;
  if (norm.indexOf("dvtphu") !== -1 || norm.indexOf("donviphu") !== -1) return true;
  if (norm.indexOf("heso") !== -1 && (norm.indexOf("dvt") !== -1 || norm.indexOf("donvi") !== -1)) {
    return true;
  }
  return false;
}

export function scoreImportHeaderRole(norm: string, role: ImportRole): number {
  if (!norm) return 0;

  if (role === "parentSku") {
    if (norm === "parentsku" || norm === "parent" || norm === "manhomban") return 100;
    if (
      (norm.includes("mahang") || norm.includes("mahanghoa")) &&
      (norm.includes("cha") || norm.includes("parent"))
    ) {
      return 95;
    }
    if (norm.includes("parentsku") || norm.includes("manhomban")) return 90;
    return 0;
  }

  if (role === "dvt2") {
    if (!isImportDvt2HeaderNorm(norm)) return 0;
    if (norm.includes("quydoi")) return 100;
    if (norm.includes("dvt2") || norm.includes("donvi2")) return 95;
    return 85;
  }

  if (role === "dvt") {
    if (isImportDvt2HeaderNorm(norm)) return 0;
    if (norm.includes("price") || norm.includes("gia")) return 0;
    if (norm.includes("madvt") || norm === "madvt") return 0;
    if (norm === "donvitinh" || norm === "dvtinh") return 100;
    if (norm === "tendvt" || norm === "dvtchinh" || norm === "donvichinh") return 98;
    if (norm === "dvt" || norm === "donvi") return 96;
    // GAS: "Thông tin cần cập nhật/Đơn vị tính"
    if (norm.includes("thongtincancapnhat") && norm.includes("donvi")) return 97;
    if (norm === "basicunit" || norm === "unitname" || norm === "uom" || norm === "unit") return 88;
    if (norm.includes("donvitinh")) return 94;
    if (norm.includes("tendvt") || norm.includes("dvtchinh")) return 92;
    if (norm.startsWith("dvt") && norm.length <= 12) return 80;
    return 0;
  }

  if (role === "maHang") {
    if (norm.includes("cha") || norm.includes("parent")) return 0;
    if (norm.includes("mavach") || norm.includes("barcode")) return 0;
    if (norm === "mahanghoa" || norm === "masanpham") return 100;
    if (norm === "masp" || norm === "mahang" || norm === "mahh") return 96;
    // GAS / MISA: "f/Mã hàng hóa", "Mã hàng hóa"
    if (norm === "fmahanghoa" || norm.endsWith("mahanghoa")) return 98;
    if (norm === "itemcode" || norm === "article" || norm === "sku") return 90;
    if (norm.includes("mahanghoa") || norm.includes("masanpham")) return 94;
    if (norm.includes("mahang") && !norm.includes("vach")) return 88;
    return 0;
  }

  if (role === "maVach") {
    if (norm === "mavach" || norm === "barcode" || norm === "barcodeid" || norm === "ean") return 100;
    if (norm.includes("mavach")) return 95;
    if (norm.includes("barcode")) return 90;
    if (norm.includes("ean") && norm.length <= 8) return 80;
    return 0;
  }

  if (role === "tenHang") {
    if (norm.includes("dvt") || norm.includes("donvi") || norm.includes("unit")) return 0;
    if (norm === "tenhanghoa" || norm === "tensanpham") return 100;
    if (norm === "tensp" || norm === "tenhang") return 96;
    // GAS: "Thông tin cần cập nhật/Tên hàng hóa"
    if (norm.includes("thongtincancapnhat") && norm.includes("ten")) return 97;
    if (norm === "description") return 85;
    if (norm === "name") return 70;
    if (norm.includes("tenhanghoa") || norm.includes("tensanpham")) return 94;
    if (norm.includes("tenhang") || norm.includes("tensp")) return 90;
    return 0;
  }

  if (role === "tonKho") {
    if (norm === "tonkho" || norm === "soluongton" || norm === "slton" || norm === "cuoiky") return 100;
    if (norm === "tonhientai") return 99;
    if (norm.includes("tonbandau") || norm === "bandau") return 0;
    if (norm.includes("nhapkho") || norm.includes("xuatkho")) return 0;
    if (norm === "soluong" || norm === "soton" || norm === "onhand" || norm === "stock") return 92;
    if (norm.includes("tonhientai") || norm.includes("tonkho") || norm.includes("soluongton")) return 95;
    if (norm.includes("soton")) return 90;
    if (norm === "qty" || norm === "quantity") return 75;
    if (norm.includes("soluong") && !norm.includes("quydoi")) return 80;
    return 0;
  }

  // Order line quantity — prefer SL / số lượng, avoid stock on-hand headers
  if (role === "soLuong") {
    if (norm.includes("tonkho") || norm.includes("tonhientai") || norm.includes("cuoiky")) return 0;
    if (norm.includes("onhand") || norm.includes("stock") || norm === "soton") return 0;
    if (norm.includes("nhapkho") || norm.includes("xuatkho")) return 0;
    if (norm === "sl" || norm === "soluong" || norm === "soluongdat") return 100;
    if (norm === "qty" || norm === "quantity" || norm === "orderedqty") return 95;
    if (norm.includes("soluong") && !norm.includes("quydoi") && !norm.includes("ton")) return 90;
    if (norm === "slgoc" || norm === "sldat") return 88;
    return 0;
  }

  return 0;
}

export function mapImportHeaderColumns(headerRow: unknown[]): ImportColumnMap {
  const out: ImportColumnMap = {
    maHang: -1,
    tenHang: -1,
    dvt: -1,
    dvt2: -1,
    maVach: -1,
    parentSku: -1,
    tonKho: -1,
    soLuong: -1,
    labels: {},
    scores: {},
  };
  if (!headerRow?.length) return out;

  const roles: ImportRole[] = [
    "parentSku",
    "dvt2",
    "dvt",
    "maHang",
    "maVach",
    "tenHang",
    "tonKho",
    "soLuong",
  ];
  const best: Record<string, { idx: number; score: number }> = {};
  for (const role of roles) best[role] = { idx: -1, score: 0 };

  for (let c = 0; c < headerRow.length; c++) {
    const norm = normalizeHeaderText(headerRow[c]);
    if (!norm) continue;
    for (const role of roles) {
      const sc = scoreImportHeaderRole(norm, role);
      if (sc > best[role].score) best[role] = { idx: c, score: sc };
    }
  }

  const orderByPriority: ImportRole[] = [
    "parentSku",
    "dvt2",
    "maVach",
    "maHang",
    "dvt",
    "soLuong",
    "tenHang",
    "tonKho",
  ];
  const assignOrder = [...orderByPriority].sort(
    (a, b) => (best[b].score || 0) - (best[a].score || 0),
  );
  const taken: Record<number, string> = {};
  for (const role of assignOrder) {
    const cand = best[role];
    if (!cand || cand.idx < 0 || cand.score < 70) continue;
    if (taken[cand.idx]) continue;
    out[role] = cand.idx;
    out.scores[role] = cand.score;
    taken[cand.idx] = role;
  }

  (Object.keys(out.scores) as ImportRole[]).forEach((role) => {
    const idx = out[role];
    if (typeof idx === "number" && idx >= 0) {
      out.labels[role] = String(headerRow[idx] ?? "");
    }
  });

  return out;
}

export function findImportHeaderRowIndex(rows: unknown[][], maxScan = 15): number {
  if (!rows?.length) return 0;
  const limit = Math.min(rows.length, maxScan);
  let bestScore = -1;
  let best = 0;
  for (let hi = 0; hi < limit; hi++) {
    const row = rows[hi] || [];
    const mapped = mapImportHeaderColumns(row);
    let score = 0;
    if (mapped.maHang >= 0) score += mapped.scores.maHang || 80;
    if (mapped.maVach >= 0) score += mapped.scores.maVach || 70;
    if (mapped.tenHang >= 0) score += mapped.scores.tenHang || 70;
    if (mapped.dvt >= 0) score += mapped.scores.dvt || 80;
    if (mapped.soLuong >= 0) score += mapped.scores.soLuong || 90;
    else if (mapped.tonKho >= 0) score += 30;
    if (mapped.dvt2 >= 0) score += 20;
    let nonEmpty = 0;
    for (const cell of row) {
      if (String(cell ?? "").trim()) nonEmpty++;
    }
    score += Math.min(nonEmpty, 8);
    if (score > bestScore) {
      bestScore = score;
      best = hi;
    }
  }
  return best;
}

export function isImportJunkDataRow(row: unknown[], cols?: ImportColumnMap): boolean {
  if (!row) return true;
  const cells: string[] = [];
  for (const cell of row) {
    const t = String(cell ?? "").trim();
    if (t) cells.push(t);
  }
  if (!cells.length) return true;
  const joinedNorm = normalizeHeaderText(cells.join(" "));
  if (joinedNorm.includes("tongcong") || joinedNorm === "tong" || joinedNorm.startsWith("total")) {
    return true;
  }
  if (joinedNorm.includes("congty") && cells.length <= 3) return true;
  if (joinedNorm.includes("baocao") || joinedNorm.includes("phieukiem")) return true;
  if (joinedNorm.includes("ngaylap") || joinedNorm.startsWith("trang")) return true;

  if (cols) {
    let lookLikeHeader = 0;
    if (
      cols.maHang >= 0 &&
      scoreImportHeaderRole(normalizeHeaderText(row[cols.maHang]), "maHang") >= 70
    ) {
      lookLikeHeader++;
    }
    if (cols.dvt >= 0 && scoreImportHeaderRole(normalizeHeaderText(row[cols.dvt]), "dvt") >= 70) {
      lookLikeHeader++;
    }
    if (
      cols.tenHang >= 0 &&
      scoreImportHeaderRole(normalizeHeaderText(row[cols.tenHang]), "tenHang") >= 70
    ) {
      lookLikeHeader++;
    }
    if (lookLikeHeader >= 2) return true;
  }
  return false;
}

export function isPlausibleDvtValue(value: string): boolean {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 40) return false;
  if (/^\d+([.,]\d+)?$/.test(raw)) return false;
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(raw)) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return false;
  return true;
}

export function sanitizeImportDvt(value: unknown): string {
  let raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.charAt(0) === "'") raw = raw.slice(1).trim();
  raw = raw.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
  if (!isPlausibleDvtValue(raw)) return "";
  return raw;
}

export function normalizeProductCode(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (typeof value === "number" && Number.isFinite(value)) {
    text =
      Math.floor(value) === value && Math.abs(value) < 1e16
        ? String(Math.round(value))
        : String(value);
  } else {
    text = String(value).trim();
  }
  if (!text) return "";
  try {
    text = text.normalize("NFC");
  } catch {
    /* ignore */
  }
  if (text.charAt(0) === "'") text = text.slice(1);
  text = text.replace(/\u00A0/g, "").replace(/\s+/g, "");

  if (/^[+-]?\d+(\.\d+)?e[+-]?\d+$/i.test(text)) {
    const sciNum = Number(text);
    if (Number.isFinite(sciNum) && Math.abs(sciNum) < 1e16) {
      text = String(Math.round(sciNum));
    }
  }
  if (/^\d+\.0+$/i.test(text)) text = text.replace(/\.0+$/, "");
  if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, "");
  return text;
}

/** VN/EU quantity parse — GAS parseQuantityValue */
export function parseQuantityValue(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isNaN(value) ? 0 : value;
  let text = String(value).trim();
  if (!text) return 0;
  let normalized = text.replace(/\s+/g, "").replace(/\u00A0/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/,/g, "");
  } else if (/^\d+,\d+$/.test(normalized) && !normalized.includes(".")) {
    normalized = normalized.replace(/,/g, ".");
  } else {
    normalized = normalized.replace(/,/g, "");
  }
  const n = Number(normalized);
  return Number.isNaN(n) ? 0 : n;
}

export function normalizeImportedMatrix(fileData: unknown[][]): unknown[][] {
  if (!fileData?.length) throw new Error("File trống hoặc không có dữ liệu.");
  let start = 0;
  while (
    start < fileData.length &&
    !(fileData[start] || []).some((c) => String(c ?? "").trim())
  ) {
    start++;
  }
  let end = fileData.length - 1;
  while (end >= start && !(fileData[end] || []).some((c) => String(c ?? "").trim())) {
    end--;
  }
  if (end < start) throw new Error("File không có dòng dữ liệu hợp lệ.");
  const slice = fileData.slice(start, end + 1);
  let maxCols = 0;
  for (const row of slice) maxCols = Math.max(maxCols, (row || []).length);
  return slice.map((row) => {
    const r = [...(row || [])];
    while (r.length < maxCols) r.push("");
    return r;
  });
}

/** Quantity column for order lines: soLuong first, fallback tonKho (legacy files) */
export function resolveQtyColumnIndex(cols: ImportColumnMap): number {
  if (cols.soLuong >= 0) return cols.soLuong;
  if (cols.tonKho >= 0) return cols.tonKho;
  return -1;
}
