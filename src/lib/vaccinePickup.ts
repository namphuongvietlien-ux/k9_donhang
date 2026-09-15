/**
 * Nhắc lấy vaccine theo khung giờ kho nhận — dùng chung cho nhắc trên trình duyệt
 * (tài khoản admin đang mở web) và bot Telegram (supabase/functions/telegram-vaccine-pickup).
 * - 11:00 VN → PH, Q8, Q5
 * - 12:30 VN → Q4 Mới (Q4_275), Q4 Cũ (Q4_178), Q1
 * Chỉ phiếu DH/DT/DC pending|processing, packing_date = hôm nay VN, mã hàng chứa VAC.
 */
import { supabase } from "@/integrations/supabase/client";

export type VaccineSlotKey = "noon" | "afternoon";

export interface VaccineSlot {
  key: VaccineSlotKey;
  /** Giờ VN dạng HH:mm */
  time: string;
  hour: number;
  minute: number;
  codes: string[];
  label: string;
}

export const VACCINE_PICKUP_SLOTS: VaccineSlot[] = [
  { key: "noon", time: "11:00", hour: 11, minute: 0, codes: ["PH", "Q8", "Q5"], label: "PH · Q8 · Q5" },
  {
    key: "afternoon",
    time: "12:30",
    hour: 12,
    minute: 30,
    codes: ["Q4_275", "Q4_178", "Q1"],
    label: "Q4 Mới · Q4 Cũ · Q1",
  },
];

/** Sau giờ hẹn bao lâu vẫn còn nhắc nếu web mở muộn (phút) */
export const VACCINE_REMIND_WINDOW_MIN = 90;

const CODE_LABEL: Record<string, string> = {
  PH: "PH",
  Q8: "Q8",
  Q5: "Q5",
  Q1: "Q1",
  Q4_275: "Q4 Mới",
  Q4_178: "Q4 Cũ",
};

export function isVacSku(slug: string | null | undefined): boolean {
  return /VAC/i.test(String(slug || ""));
}

/** Ngày + giờ hiện tại theo Asia/Ho_Chi_Minh */
export function vnNow(now: Date = new Date()): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
  };
}

/** Slot đang "tới giờ": từ giờ hẹn tới giờ hẹn + VACCINE_REMIND_WINDOW_MIN */
export function getDueVaccineSlot(now: Date = new Date()): VaccineSlot | null {
  const { hour, minute } = vnNow(now);
  const cur = hour * 60 + minute;
  for (const slot of VACCINE_PICKUP_SLOTS) {
    const start = slot.hour * 60 + slot.minute;
    if (cur >= start && cur < start + VACCINE_REMIND_WINDOW_MIN) return slot;
  }
  return null;
}

export interface VaccinePickupHit {
  orderId: string;
  soPhieu: string;
  kho: string;
  lines: { sku: string; name: string; qty: number; unit: string }[];
}

type OrderRow = {
  id: string;
  order_code: string | null;
  warehouse_id: string | null;
  order_items:
    | { product_slug: string | null; product_name: string | null; quantity: number | null; unit: string | null }[]
    | null;
};

/** Phiếu có vaccine cần lấy cho slot, ngày soạn `today` (YYYY-MM-DD VN) */
export async function fetchVaccinePickupHits(
  slot: VaccineSlot,
  today: string,
): Promise<VaccinePickupHit[]> {
  const { data: warehouses, error: whErr } = await supabase
    .from("warehouses" as never)
    .select("id, code")
    .in("code", slot.codes);
  if (whErr) throw whErr;
  const whs = (warehouses as { id: string; code: string }[] | null) || [];
  if (!whs.length) return [];
  const codeById = new Map(whs.map((w) => [w.id, w.code]));

  const { data: orders, error: ordErr } = await supabase
    .from("orders")
    .select(
      "id, order_code, status, packing_date, warehouse_id, order_items ( product_slug, product_name, quantity, unit )",
    )
    .in("order_kind" as never, ["DH", "DT", "DC"])
    .in("status", ["pending", "processing"])
    .eq("packing_date" as never, today)
    .in("warehouse_id" as never, whs.map((w) => w.id));
  if (ordErr) throw ordErr;

  const hits: VaccinePickupHit[] = [];
  for (const o of (orders as unknown as OrderRow[]) || []) {
    const vac = (o.order_items || []).filter((it) => isVacSku(it.product_slug));
    if (!vac.length) continue;
    const code = codeById.get(o.warehouse_id || "") || "";
    hits.push({
      orderId: o.id,
      soPhieu: o.order_code || o.id.slice(0, 8),
      kho: CODE_LABEL[code] || code || "—",
      lines: vac.map((it) => ({
        sku: String(it.product_slug || "").trim(),
        name: String(it.product_name || "").trim(),
        qty: Number(it.quantity) || 0,
        unit: String(it.unit || "").trim() || "cái",
      })),
    });
  }
  return hits;
}

export function formatVaccineReminder(slot: VaccineSlot, hits: VaccinePickupHit[]) {
  const totalQty = hits.reduce((s, h) => s + h.lines.reduce((x, l) => x + l.qty, 0), 0);
  const title = `💉 Nhắc lấy vaccine ${slot.time} — ${slot.label}`;
  const summary = hits
    .map((h) => `${h.soPhieu} (${h.kho}): ${h.lines.map((l) => `${l.sku} ×${l.qty}`).join(", ")}`)
    .join("\n");
  return {
    title,
    body: `${hits.length} phiếu · ${totalQty} liều\n${summary}`,
  };
}
