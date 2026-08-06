/**
 * Client gọi Edge Function notify-telegram (không chặn UI nếu lỗi).
 * Port GAS sendTelegramMessage — luôn kèm link mở chi tiết trên web.
 */
import { supabase } from "@/integrations/supabase/client";

export type TelegramEvent =
  | "order_created"
  | "order_packed"
  | "order_received"
  | "order_cancelled"
  | "order_changed"
  | "order_restored"
  | "xb_created"
  | "xb_cancelled"
  | "xb_restored";

/** Origin public (Vercel) — tránh gửi link localhost khi dev */
export function getPublicAppOrigin(): string {
  const fromEnv = String(import.meta.env.VITE_SITE_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window === "undefined") return "";
  const origin = window.location.origin;
  // Dev local → fallback production portal kho
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    return "https://donhang-dieuchuyen.vercel.app";
  }
  return origin;
}

/** Link mở phiếu DH/DC trên portal kho (tránh nhầm /admin) */
export function buildWarehouseOrderViewUrl(soPhieu: string): string {
  const origin = getPublicAppOrigin();
  const code = encodeURIComponent(soPhieu || "");
  return `${origin}/?tab=manage&soPhieu=${code}`;
}

/** Link mở / in phiếu Xuất bán XB (portal) */
export function buildXbViewUrl(voucherCode: string): string {
  const origin = getPublicAppOrigin();
  const code = encodeURIComponent(voucherCode || "");
  return `${origin}/?tab=xb&xb=${code}`;
}

export function buildTelegramOrderLinkText(
  soPhieu: string,
  opts?: { kind?: "DH" | "XB"; pdfHint?: boolean },
): string {
  const kind = opts?.kind || (String(soPhieu).toUpperCase().startsWith("XB-") ? "XB" : "DH");
  const url =
    kind === "XB"
      ? buildXbViewUrl(soPhieu)
      : buildWarehouseOrderViewUrl(soPhieu);
  return `Mở chi tiết đơn: ${url}`;
}

export function buildWarehouseTelegramText(input: {
  event: TelegramEvent;
  soPhieu: string;
  khoXuat?: string;
  khoNhan?: string;
  extra?: string;
}): string {
  const kx = input.khoXuat || "—";
  const kn = input.khoNhan || "—";
  const so = input.soPhieu || "—";
  const link = buildTelegramOrderLinkText(so, {
    kind: so.toUpperCase().startsWith("XB-") ? "XB" : "DH",
  });
  switch (input.event) {
    case "order_created":
      return `🆕 Phiếu mới ${so}\nXuất: ${kx} → Nhận: ${kn}${input.extra ? `\n${input.extra}` : ""}\n\n${link}`;
    case "order_packed":
      return `📦 Đã soạn ${so}\n${kx} → ${kn}\nChờ kho nhận xác nhận.${input.extra ? `\n${input.extra}` : ""}\n\n${link}`;
    case "order_received":
      return `✅ Đã nhận ${so}\n${kx} → ${kn}${input.extra ? `\n${input.extra}` : ""}\n\n${link}`;
    case "order_cancelled":
      return `❌ Đã hủy ${so}\n${kx} → ${kn}${input.extra ? `\n${input.extra}` : ""}\n\n${link}`;
    case "order_restored":
      return `♻️ Đã khôi phục ${so}\n${kx} → ${kn}${input.extra ? `\n${input.extra}` : ""}\n\n${link}`;
    case "order_changed":
      return `✏️ Cập nhật ${so}\n${kx} → ${kn}${input.extra ? `\n${input.extra}` : ""}\n\n${link}`;
    case "xb_created":
      return `🧾 Xuất bán mới ${so}\nCN: ${kn}${input.extra ? `\n${input.extra}` : ""}\n\n${link}`;
    case "xb_cancelled":
      return `🛑 Đã hủy xuất bán ${so}\nCN: ${kn}${input.extra ? `\n${input.extra}` : ""}\n\n${link}`;
    case "xb_restored":
      return `♻️ Đã khôi phục xuất bán ${so}\nCN: ${kn}${input.extra ? `\n${input.extra}` : ""}\n\n${link}`;
    default:
      return `${so}: ${kx} → ${kn}\n\n${link}`;
  }
}

/** Fire-and-forget — không throw ra UI */
export async function notifyTelegram(text: string): Promise<void> {
  const msg = String(text || "").trim();
  if (!msg) return;
  try {
    await supabase.functions.invoke("notify-telegram", {
      body: { text: msg },
    });
  } catch {
    /* ignore — Telegram không chặn nghiệp vụ */
  }
}

export async function notifyWarehouseEvent(input: {
  event: TelegramEvent;
  soPhieu: string;
  khoXuat?: string;
  khoNhan?: string;
  extra?: string;
}): Promise<void> {
  await notifyTelegram(buildWarehouseTelegramText(input));
}
