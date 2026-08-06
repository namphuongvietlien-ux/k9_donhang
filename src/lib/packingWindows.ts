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

/** GAS STORE_MAP short codes */
export const STORE_SHORT_CODES: Record<string, string> = {
  "Kho Địa điểm kinh doanh Q7": "Q7",
  "Kho Địa điểm kinh doanh 01": "Q4_178",
  "Kho Địa điểm kinh doanh 02": "Q8",
  "Kho Địa điểm kinh doanh 03": "PH",
  "Kho Địa điểm kinh doanh 04": "Q5",
  "Kho Địa điểm kinh doanh 05": "Q1",
  "Kho Địa điểm kinh doanh 06": "Q4_275",
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

/** Parse any common VN/ISO datetime → Unix ms (local components) */
export function toHoChiMinhMillis(value: unknown): number {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  if (value === null || value === undefined || value === "") return NaN;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const s = String(value).trim();
  if (!s) return NaN;

  const mIso = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?/,
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

  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? NaN : fallback.getTime();
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
  const d = new Date(ms);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatOrderTimestampUi(valueOrMs: unknown): string {
  const ms = toHoChiMinhMillis(valueOrMs);
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatOrderCreatedAtPretty(valueOrMs: unknown): string {
  const ms = toHoChiMinhMillis(valueOrMs);
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())} - ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// ── Packing windows (packing_timeline) ───────────────────────

export function getPackingDayWindows(
  packingDayDate?: Date | null,
  opts?: { mainStartTime?: string; mainEndTime?: string; suppEndTime?: string },
): PackingDayWindows {
  const packingDay = packingDayDate
    ? startOfLocalDay(packingDayDate)
    : getTodayStart();
  const prevDay = new Date(
    packingDay.getFullYear(),
    packingDay.getMonth(),
    packingDay.getDate() - 1,
    0,
    0,
    0,
    0,
  );

  const mainStartTime = opts?.mainStartTime || "10:00";
  const mainEndTime = opts?.mainEndTime || "08:00";
  const suppEndTime = opts?.suppEndTime || "10:00";

  const mainStart = combineDateAndTime(prevDay, mainStartTime)!;
  const mainEnd = combineDateAndTime(packingDay, mainEndTime)!;
  const suppEnd = combineDateAndTime(packingDay, suppEndTime)!;

  const fmtRange = (a: Date, b: Date) =>
    `${pad2(a.getDate())}/${pad2(a.getMonth() + 1)} ${pad2(a.getHours())}:${pad2(a.getMinutes())} → ${pad2(b.getDate())}/${pad2(b.getMonth() + 1)} ${pad2(b.getHours())}:${pad2(b.getMinutes())}`;

  return {
    packingDay,
    prevDay,
    mainStart,
    mainEnd,
    suppStart: mainEnd,
    suppEnd,
    startMs: mainStart.getTime(),
    midMs: mainEnd.getTime(),
    endMs: suppEnd.getTime(),
    packingDayStr: toDateKey(packingDay),
    prevDayStr: toDateKey(prevDay),
    mainLabel: `${fmtRange(mainStart, mainEnd)} (không gồm ${pad2(mainEnd.getHours())}:${pad2(mainEnd.getMinutes())})`,
    suppLabel: `${fmtRange(mainEnd, suppEnd)} (không gồm ${pad2(suppEnd.getHours())}:${pad2(suppEnd.getMinutes())})`,
    totalLabel: `${fmtRange(mainStart, suppEnd)} (không gồm ${pad2(suppEnd.getHours())}:${pad2(suppEnd.getMinutes())})`,
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
 * Infer packing day N2 from createdAt:
 * hour >= 10 → N2 = next calendar day; else N2 = same day
 */
export function inferPackingDayFromCreatedAt(createdAt: Date | string | number): {
  packingDay: Date;
  mode: PackingMode;
  win: PackingDayWindows;
} {
  const ms = toHoChiMinhMillis(createdAt);
  const at = new Date(ms);
  const hour = at.getHours() + at.getMinutes() / 60;
  const day = startOfLocalDay(at);
  const packingDay =
    hour >= 10
      ? new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 0, 0, 0, 0)
      : day;
  const win = getPackingDayWindows(packingDay);
  const mode: PackingMode = isInPackingSuppWindow(ms, win) ? "supp" : "main";
  return { packingDay, mode, win };
}

function formatViDate(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatViDateTime(d: Date): string {
  return `${formatViDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
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

/** Short warehouse label like GAS formatShortStoreLabel */
export function formatShortStoreLabel(storeName: string): string {
  const normalized = String(storeName || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
  if (normalized.includes("q7") || normalized.includes("quan7")) return "Q7";
  if (normalized.includes("q8") || normalized.includes("quan8")) return "Q8";
  if (normalized.includes("phamhung") || normalized === "ph") return "PH";
  if (normalized.includes("q5") || normalized.includes("quan5")) return "Q5";
  if (normalized.includes("q1") || normalized.includes("quan1")) return "Q1";
  if (normalized.includes("178")) return "Q4_178";
  if (normalized.includes("275")) return "Q4_275";
  return storeName.slice(0, 8).toUpperCase() || "—";
}
