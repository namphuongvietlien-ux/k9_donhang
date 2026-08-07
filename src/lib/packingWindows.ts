/**
 * Port from GAS: utils_helpers.gs + packing_timeline.gs
 * Timezone: Asia/Ho_Chi_Minh (local Date components — same model as Apps Script when TZ=VN)
 *
 * Packing day N2 windows (half-open):
 * - main:  [N1 10:00, N2 08:00)
 * - supp:  [N2 08:00, N2 10:00)
 * - total: [N1 10:00, N2 10:00)
 */

export const PACKING_TZ = "Asia/Ho_Chi_Minh";

export type PackingMode = "main" | "supp" | "total";
/** Alias used by earlier React code */
export type PackingShift = "main" | "supplement";

export interface PackingDayWindows {
  packingDay: Date;
  prevDay: Date;
  mainStart: Date;
  mainEnd: Date;
  suppStart: Date;
  suppEnd: Date;
  startMs: number;
  midMs: number;
  endMs: number;
  packingDayStr: string;
  prevDayStr: string;
  mainLabel: string;
  suppLabel: string;
  totalLabel: string;
}

export interface PackingWindow {
  packingDate: Date;
  shift: PackingShift;
  windowStart: Date;
  windowEnd: Date;
}

export const SHIFT_LABELS: Record<PackingShift, string> = {
  main: "Ca chính (10:00→08:00)",
  supplement: "Ca bổ sung (08:00→10:00)",
};

export const MODE_LABELS: Record<PackingMode, string> = {
  main: "Đơn Chính",
  supp: "Đơn Bổ Sung",
  total: "Tổng hợp ca",
};

export const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;
export const WEEKDAY_NAMES_VI = [
  "Thứ 2",
  "Thứ 3",
  "Thứ 4",
  "Thứ 5",
  "Thứ 6",
  "Thứ 7",
  "Chủ Nhật",
] as const;

export const DUP_TIME_MINUTES = 60;
export const DUP_PRESAVE_MINUTES = 5;

/** GAS STORE_MAP — code nội bộ (khớp warehouses.code) */
export const STORE_SHORT_CODES: Record<string, string> = {
  "Kho Địa điểm kinh doanh Q7": "Q7",
  "Kho Địa điểm kinh doanh 01": "Q4_178",
  "Kho Địa điểm kinh doanh 02": "Q8",
  "Kho Địa điểm kinh doanh 03": "PH",
  "Kho Địa điểm kinh doanh 04": "Q5",
  "Kho Địa điểm kinh doanh 05": "Q1",
  "Kho Địa điểm kinh doanh 06": "Q4_275",
};

/** Nhãn hiển thị UI — KD 01 = Q4 Mới, KD 06 = Q4 Cũ (không hiện Q4_178/Q4_275) */
export const STORE_DISPLAY_LABELS: Record<string, string> = {
  "Kho Địa điểm kinh doanh Q7": "Q7",
  "Kho Địa điểm kinh doanh 01": "Q4 Mới",
  "Kho Địa điểm kinh doanh 02": "Q8",
  "Kho Địa điểm kinh doanh 03": "PH",
  "Kho Địa điểm kinh doanh 04": "Q5",
  "Kho Địa điểm kinh doanh 05": "Q1",
  "Kho Địa điểm kinh doanh 06": "Q4 Cũ",
};

// ── Date primitives (utils_helpers) ──────────────────────────

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateInputYYYYMMDD(value: string | null | undefined): Date | null {
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function combineDateAndTime(dateObj: Date, timeHHmm: string): Date | null {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return null;
  const m = String(timeHHmm || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), hh, mm, 0, 0);
}

/**
 * Parse datetime → Unix ms absolute.
 * ISO có Z / offset (+07:00) phải parse theo UTC/offset thật — không lấy
 * thành phần giờ trong chuỗi làm giờ local (bug khiến 08:30 VN = 01:30Z
 * bị hiểu thành 01:30 local → lệch ca bổ sung 08:00–10:00).
 */
export function toHoChiMinhMillis(value: unknown): number {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  if (value === null || value === undefined || value === "") return NaN;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const s = String(value).trim();
  if (!s) return NaN;

  // ISO / timestamptz với timezone: dùng parser chuẩn
  if (
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s) &&
    /(Z|[+-]\d{2}:?\d{2})$/i.test(s)
  ) {
    const abs = Date.parse(s);
    return Number.isNaN(abs) ? NaN : abs;
  }

  // ISO không timezone — coi như giờ tường Asia/Ho_Chi_Minh (local components)
  const mIso = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/,
  );
  if (mIso) {
    return new Date(
      Number(mIso[1]),
      Number(mIso[2]) - 1,
      Number(mIso[3]),
      Number(mIso[4] || 0),
      Number(mIso[5] || 0),
      Number(mIso[6] || 0),
      0,
    ).getTime();
  }

  const mVn = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (mVn) {
    return new Date(
      Number(mVn[3]),
      Number(mVn[2]) - 1,
      Number(mVn[1]),
      Number(mVn[4] || 0),
      Number(mVn[5] || 0),
      Number(mVn[6] || 0),
      0,
    ).getTime();
  }

  const fallback = Date.parse(s);
  return Number.isNaN(fallback) ? NaN : fallback;
}

/**
 * Thành phần giờ tường tại Asia/Ho_Chi_Minh (không phụ thuộc TZ máy).
 */
export function getHoChiMinhParts(ms: number): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: PACKING_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(ms));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value || 0);
  let hour = get("hour");
  // en-GB đôi khi trả 24 cho nửa đêm
  if (hour === 24) hour = 0;
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Absolute ms của một mốc giờ tường VN (y-m-d HH:mm) */
export function vnWallTimeToMillis(
  year: number,
  monthIndex0: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number {
  // Xây ISO +07:00 — ổn định dù máy local không phải VN
  const y = String(year).padStart(4, "0");
  const m = String(monthIndex0 + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  const ss = String(second).padStart(2, "0");
  return Date.parse(`${y}-${m}-${d}T${hh}:${mm}:${ss}+07:00`);
}

export const toMillisSafe = toHoChiMinhMillis;

export function getTodayStart(): Date {
  return startOfLocalDay(new Date());
}

export function formatSheetDateYYYYMMDD(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toDateKey(value);
  const asString = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(asString)) return asString;
  const ms = toHoChiMinhMillis(value);
  if (Number.isNaN(ms)) return "";
  return toDateKey(new Date(ms));
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function formatOrderCreatedAtLabel(valueOrMs: unknown): string {
  const ms = toHoChiMinhMillis(valueOrMs);
  if (Number.isNaN(ms)) return "";
  const p = getHoChiMinhParts(ms);
  return `${pad2(p.day)}/${pad2(p.month)}/${p.year} ${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function formatOrderTimestampUi(valueOrMs: unknown): string {
  const ms = toHoChiMinhMillis(valueOrMs);
  if (Number.isNaN(ms)) return "";
  const p = getHoChiMinhParts(ms);
  return `${pad2(p.hour)}:${pad2(p.minute)} ${pad2(p.day)}/${pad2(p.month)}/${p.year}`;
}

export function formatOrderCreatedAtPretty(valueOrMs: unknown): string {
  const ms = toHoChiMinhMillis(valueOrMs);
  if (Number.isNaN(ms)) return "";
  const p = getHoChiMinhParts(ms);
  return `${pad2(p.hour)}:${pad2(p.minute)} - ${pad2(p.day)}/${pad2(p.month)}/${p.year}`;
}

// ── Packing windows (packing_timeline) ───────────────────────

export function getPackingDayWindows(
  packingDayDate?: Date | null,
  opts?: { mainStartTime?: string; mainEndTime?: string; suppEndTime?: string },
): PackingDayWindows {
  // Ngày giao: ưu tiên Y-M-D từ Date local (input date picker), else lịch VN hôm nay
  let y: number;
  let mo: number; // 1-12
  let d: number;
  if (packingDayDate && !Number.isNaN(packingDayDate.getTime())) {
    y = packingDayDate.getFullYear();
    mo = packingDayDate.getMonth() + 1;
    d = packingDayDate.getDate();
  } else {
    const p = getHoChiMinhParts(Date.now());
    y = p.year;
    mo = p.month;
    d = p.day;
  }

  const prevDate = new Date(y, mo - 1, d - 1);
  const py = prevDate.getFullYear();
  const pmo = prevDate.getMonth() + 1;
  const pd = prevDate.getDate();

  const mainStartTime = opts?.mainStartTime || "10:00";
  const mainEndTime = opts?.mainEndTime || "08:00";
  const suppEndTime = opts?.suppEndTime || "10:00";

  const parseHm = (t: string) => {
    const m = String(t).match(/^(\d{1,2}):(\d{2})$/);
    return { hh: Number(m?.[1] || 0), mm: Number(m?.[2] || 0) };
  };
  const ms = parseHm(mainStartTime);
  const me = parseHm(mainEndTime);
  const se = parseHm(suppEndTime);

  const mainStartMs = vnWallTimeToMillis(py, pmo - 1, pd, ms.hh, ms.mm);
  const mainEndMs = vnWallTimeToMillis(y, mo - 1, d, me.hh, me.mm);
  const suppEndMs = vnWallTimeToMillis(y, mo - 1, d, se.hh, se.mm);
  const packingDayMs = vnWallTimeToMillis(y, mo - 1, d, 0, 0, 0);
  const prevDayMs = vnWallTimeToMillis(py, pmo - 1, pd, 0, 0, 0);

  const mainStart = new Date(mainStartMs);
  const mainEnd = new Date(mainEndMs);
  const suppEnd = new Date(suppEndMs);
  const packingDay = new Date(packingDayMs);
  const prevDay = new Date(prevDayMs);

  const fmtRange = (aMs: number, bMs: number) => {
    const ap = getHoChiMinhParts(aMs);
    const bp = getHoChiMinhParts(bMs);
    return `${pad2(ap.day)}/${pad2(ap.month)} ${pad2(ap.hour)}:${pad2(ap.minute)} → ${pad2(bp.day)}/${pad2(bp.month)} ${pad2(bp.hour)}:${pad2(bp.minute)}`;
  };

  return {
    packingDay,
    prevDay,
    mainStart,
    mainEnd,
    suppStart: mainEnd,
    suppEnd,
    startMs: mainStartMs,
    midMs: mainEndMs,
    endMs: suppEndMs,
    packingDayStr: `${y}-${pad2(mo)}-${pad2(d)}`,
    prevDayStr: `${py}-${pad2(pmo)}-${pad2(pd)}`,
    mainLabel: `${fmtRange(mainStartMs, mainEndMs)} (không gồm ${pad2(me.hh)}:${pad2(me.mm)})`,
    suppLabel: `${fmtRange(mainEndMs, suppEndMs)} (không gồm ${pad2(se.hh)}:${pad2(se.mm)})`,
    totalLabel: `${fmtRange(mainStartMs, suppEndMs)} (không gồm ${pad2(se.hh)}:${pad2(se.mm)})`,
  };
}

export function isInPackingMainWindow(createdMs: number, win: PackingDayWindows): boolean {
  return createdMs >= win.startMs && createdMs < win.midMs;
}

export function isInPackingSuppWindow(createdMs: number, win: PackingDayWindows): boolean {
  return createdMs >= win.midMs && createdMs < win.endMs;
}

export function isInPackingDayWindow(createdMs: number, win: PackingDayWindows): boolean {
  return createdMs >= win.startMs && createdMs < win.endMs;
}

export function normalizePackingMode(
  mode?: string | null,
  onlyNewItems = false,
): PackingMode {
  const m = String(mode || "")
    .trim()
    .toLowerCase()
    .normalize("NFC");
  if (["main", "chinh", "chính"].includes(m)) return "main";
  if (["supp", "supplement", "bosung", "bổ sung", "bo sung"].includes(m)) return "supp";
  if (["total", "tong", "tổng", "tonghop", "tổng hợp"].includes(m)) return "total";
  return onlyNewItems ? "supp" : "total";
}

export function isInPackingModeWindow(
  createdMs: number,
  win: PackingDayWindows,
  packingMode?: string | null,
): boolean {
  const mode = normalizePackingMode(packingMode, false);
  if (mode === "main") return isInPackingMainWindow(createdMs, win);
  if (mode === "supp") return isInPackingSuppWindow(createdMs, win);
  return isInPackingDayWindow(createdMs, win);
}

/**
 * Infer packing day N2 from createdAt (theo giờ tường VN):
 * hour >= 10 → N2 = ngày lịch kế tiếp; else N2 = cùng ngày
 */
export function inferPackingDayFromCreatedAt(createdAt: Date | string | number): {
  packingDay: Date;
  mode: PackingMode;
  win: PackingDayWindows;
} {
  const ms = toHoChiMinhMillis(createdAt);
  const parts = getHoChiMinhParts(ms);
  const hour = parts.hour + parts.minute / 60;
  const packingDay =
    hour >= 10
      ? new Date(parts.year, parts.month - 1, parts.day + 1, 0, 0, 0, 0)
      : new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
  const win = getPackingDayWindows(packingDay);
  const mode: PackingMode = isInPackingSuppWindow(ms, win) ? "supp" : "main";
  return { packingDay, mode, win };
}

function formatViDate(d: Date): string {
  const p = getHoChiMinhParts(d.getTime());
  return `${pad2(p.day)}/${pad2(p.month)}/${p.year}`;
}

function formatViDateTime(d: Date): string {
  const p = getHoChiMinhParts(d.getTime());
  return `${pad2(p.day)}/${pad2(p.month)}/${p.year} ${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
}

/**
 * Banner GAS khi tạo/lưu đơn:
 * "Đơn lưu lúc này thuộc ĐỢT CHÍNH — ngày giao/tổng hợp …"
 */
export function getPackingSaveBanner(createdAt: Date | string | number = new Date()): {
  title: string;
  body: string;
  footer: string;
  mode: PackingMode;
  packingDayStr: string;
} {
  const { packingDay, mode, win } = inferPackingDayFromCreatedAt(createdAt);
  const dayStr = formatViDate(packingDay);
  const isMain = mode === "main";
  const dotLabel = isMain ? "ĐỢT CHÍNH" : "ĐỢT BỔ SUNG";
  const title = `Đơn lưu lúc này thuộc ${dotLabel} — ngày giao/tổng hợp ${dayStr}`;
  const body = isMain
    ? `Sẽ được tổng hợp soạn trong đợt chính (≥10:00 hôm trước & <08:00 hôm nay). Chi nhánh nhận sau khi kho soạn xong ngày ${dayStr}.`
    : `Sẽ được tổng hợp soạn trong đợt bổ sung (≥08:00 & <10:00 hôm nay). Chi nhánh nhận sau khi kho soạn xong ngày ${dayStr}.`;
  const footer = `Chính: ${formatViDateTime(win.mainStart)} → ${formatViDateTime(win.mainEnd)} · Bổ sung: ${formatViDateTime(win.suppStart)} → ${formatViDateTime(win.suppEnd)} · ≥10:00 thuộc ngày hôm sau.`;
  return {
    title,
    body,
    footer,
    mode,
    packingDayStr: dayStr,
  };
}

/** Backward-compat with packingShifts.ts */
export function getShiftWindow(
  packingDate: Date,
  shift: PackingShift,
): { start: Date; end: Date } {
  const win = getPackingDayWindows(packingDate);
  if (shift === "main") return { start: win.mainStart, end: win.mainEnd };
  return { start: win.suppStart, end: win.suppEnd };
}

export function inferPackingFromCreatedAt(createdAt: Date | string): PackingWindow {
  const { packingDay, mode, win } = inferPackingDayFromCreatedAt(createdAt);
  const shift: PackingShift = mode === "supp" ? "supplement" : "main";
  const { start, end } = getShiftWindow(packingDay, shift);
  return { packingDate: packingDay, shift, windowStart: start, windowEnd: end };
}

export function modeToShift(mode: PackingMode): PackingShift | null {
  if (mode === "main") return "main";
  if (mode === "supp") return "supplement";
  return null;
}

export function shiftToMode(shift: PackingShift): PackingMode {
  return shift === "supplement" ? "supp" : "main";
}

// ── Week calendar ────────────────────────────────────────────

export function getMonday(date: Date): Date {
  const d = startOfLocalDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function getWeekDays(weekStart: Date): Date[] {
  const monday = getMonday(weekStart);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

// ── Duplicate helpers (packing_timeline) ─────────────────────

export function normalizeOrderCodeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .normalize("NFC")
    .toUpperCase();
}

export function buildOrderSkuSignature(skuQtyMap: Record<string, number>): string {
  return Object.keys(skuQtyMap || {})
    .sort()
    .map((k) => `${k}:${Number(skuQtyMap[k]) || 0}`)
    .join("|");
}

export function sameCalendarDayMs(msA: number, msB: number): boolean {
  if (Number.isNaN(msA) || Number.isNaN(msB)) return false;
  return toDateKey(new Date(msA)) === toDateKey(new Date(msB));
}

export interface DuplicateOrderLike {
  id?: string;
  soPhieu?: string;
  orderCode?: string | null;
  khoNhan?: string | null;
  warehouseId?: string | null;
  createdAtMs: number;
  totalQty: number;
  skuSignature: string;
  duplicateAccepted?: boolean;
}

export interface DuplicateSuspect {
  peerSoPhieu: string;
  peerId?: string;
  peerCreatedAt: number;
  peerCreatedUi: string;
  reason: string;
  acknowledged: boolean;
}

/** GAS attachDuplicateSuspects_: same branch + (same day OR ≤60m) + (same qty OR same SKU sig) */
export function attachDuplicateSuspects<T extends DuplicateOrderLike>(
  orders: T[],
): Array<T & { duplicateSuspect?: DuplicateSuspect; isDuplicateSuspect?: boolean }> {
  const list = orders.map((o) => ({ ...o })) as Array<
    T & { duplicateSuspect?: DuplicateSuspect; isDuplicateSuspect?: boolean }
  >;

  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.duplicateSuspect) continue;
    const aMs = a.createdAtMs;
    const aStore = String(a.warehouseId || a.khoNhan || "").trim();
    if (!aStore || !aMs) continue;

    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      const bMs = b.createdAtMs;
      const bStore = String(b.warehouseId || b.khoNhan || "").trim();
      if (!bStore || !bMs) continue;
      if (aStore !== bStore) continue;

      const deltaMin = Math.abs(aMs - bMs) / 60000;
      const timeOk = sameCalendarDayMs(aMs, bMs) || deltaMin <= DUP_TIME_MINUTES;
      if (!timeOk) continue;

      const sameQty = a.totalQty > 0 && a.totalQty === b.totalQty;
      const sameSku = !!(a.skuSignature && b.skuSignature && a.skuSignature === b.skuSignature);
      if (!sameQty && !sameSku) continue;

      const reason =
        sameSku && sameQty
          ? "cùng danh mục mã & tổng SL"
          : sameSku
            ? "cùng danh mục mã hàng"
            : "cùng tổng số lượng";

      const aCode = a.soPhieu || a.orderCode || a.id || "";
      const bCode = b.soPhieu || b.orderCode || b.id || "";

      if (!a.duplicateSuspect) {
        a.duplicateSuspect = {
          peerSoPhieu: bCode,
          peerId: b.id,
          peerCreatedAt: bMs,
          peerCreatedUi: formatOrderTimestampUi(bMs),
          reason,
          acknowledged: !!a.duplicateAccepted,
        };
        a.isDuplicateSuspect = !a.duplicateSuspect.acknowledged;
      }
      if (!b.duplicateSuspect) {
        b.duplicateSuspect = {
          peerSoPhieu: aCode,
          peerId: a.id,
          peerCreatedAt: aMs,
          peerCreatedUi: formatOrderTimestampUi(aMs),
          reason,
          acknowledged: !!b.duplicateAccepted,
        };
        b.isDuplicateSuspect = !b.duplicateSuspect.acknowledged;
      }
    }
    if (a.duplicateSuspect?.acknowledged) a.isDuplicateSuspect = false;
  }

  return list;
}

/** Short warehouse label like GAS — UI hiện Q4 Cũ / Q4 Mới (không Q4_178/Q4_275) */
export function formatShortStoreLabel(storeName: string): string {
  const raw = String(storeName || "").trim();
  if (!raw) return "—";
  if (STORE_DISPLAY_LABELS[raw]) return STORE_DISPLAY_LABELS[raw];

  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
  if (normalized.includes("q7") || normalized.includes("quan7")) return "Q7";
  if (normalized.includes("q8") || normalized.includes("quan8")) return "Q8";
  if (normalized.includes("phamhung") || normalized === "ph") return "PH";
  if (normalized.includes("q5") || normalized.includes("quan5")) return "Q5";
  if (normalized.includes("q1") || normalized.includes("quan1")) return "Q1";
  // KD 01 / 178 Hoàng Diệu = Q4 Mới · KD 06 / 275 = Q4 Cũ
  if (
    normalized.includes("178") ||
    normalized.includes("kinhdoanh01") ||
    normalized === "q4_178" ||
    normalized.includes("q4moi")
  ) {
    return "Q4 Mới";
  }
  if (
    normalized.includes("275") ||
    normalized.includes("kinhdoanh06") ||
    normalized === "q4_275" ||
    normalized.includes("q4cu")
  ) {
    return "Q4 Cũ";
  }
  return raw.slice(0, 8).toUpperCase() || "—";
}
