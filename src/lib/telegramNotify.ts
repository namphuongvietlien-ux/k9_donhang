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

/** Escape nội dung động trước khi nhúng vào text parse_mode HTML. */
export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export interface TelegramNotifyResult {
  ok: boolean;
  /** true khi Edge Function bỏ qua vì thiếu secret / chưa có người nhận */
  skipped?: boolean;
  error?: string;
}

/**
 * Gọi Edge Function notify-telegram.
 *
 * Không throw (Telegram không được chặn nghiệp vụ kho) NHƯNG luôn trả về kết
 * quả thật: `supabase.functions.invoke` không throw khi HTTP != 2xx, nó trả
 * `{ error }` — nuốt lặng giá trị này là lý do trước đây lỗi Telegram hoàn
 * toàn vô hình trên UI.
 */
async function invokeNotifyTelegram(
  body: Record<string, unknown>,
): Promise<TelegramNotifyResult> {
  try {
    const { data, error } = await supabase.functions.invoke("notify-telegram", {
      body,
    });

    if (error) {
      // FunctionsHttpError giữ response — đọc để lấy message tiếng Việt từ function.
      let detail = error.message || "Không gọi được notify-telegram";
      const response = (error as { context?: Response }).context;
      if (response && typeof response.json === "function") {
        try {
          const payload = await response.clone().json();
          if (payload?.error) detail = String(payload.error);
        } catch {
          /* body không phải JSON — giữ message gốc */
        }
      }
      const result: TelegramNotifyResult = { ok: false, error: detail };
      logTelegramFailure(result, body);
      return result;
    }

    const payload = (data || {}) as {
      ok?: boolean;
      skipped?: boolean;
      error?: string;
    };
    if (payload.ok) return { ok: true };

    const result: TelegramNotifyResult = {
      ok: false,
      skipped: !!payload.skipped,
      error: payload.error || "Telegram không gửi được",
    };
    logTelegramFailure(result, body);
    return result;
  } catch (e) {
    const result: TelegramNotifyResult = {
      ok: false,
      error: e instanceof Error ? e.message : "Lỗi gọi notify-telegram",
    };
    logTelegramFailure(result, body);
    return result;
  }
}

function logTelegramFailure(
  result: TelegramNotifyResult,
  body: Record<string, unknown>,
) {
  if (process.env.NODE_ENV === "development") {
    console.warn("[notify-telegram] không gửi được:", result, body);
  }
}

/** Không throw ra UI — nhưng trả kết quả để caller có thể cảnh báo. */
export async function notifyTelegram(
  text: string,
  options?: { parseMode?: "HTML" | null },
): Promise<TelegramNotifyResult> {
  const msg = String(text || "").trim();
  if (!msg) return { ok: false, skipped: true, error: "Thiếu nội dung" };
  return invokeNotifyTelegram({
    text: msg,
    // Text nghiệp vụ là plain text (tên kho/hàng có thể chứa & < >) —
    // gửi kèm parse_mode HTML sẽ bị Telegram trả 400 và mất tin nhắn.
    parseMode: options?.parseMode ?? null,
  });
}

/** Kênh nghiệp vụ nội bộ, tách hoàn toàn khỏi nhóm đơn khách lẻ. */
export async function notifyInternalDispatchTelegram(
  text: string,
  options?: {
    warehouseId?: string;
    recipientUserIds?: string[];
    internalDispatchId?: string;
    /** Mặc định HTML — text nội bộ có thẻ <b>; nội dung động phải escape trước. */
    parseMode?: "HTML" | null;
  },
): Promise<TelegramNotifyResult> {
  const msg = String(text || "").trim();
  if (!msg) return { ok: false, skipped: true, error: "Thiếu nội dung" };
  return invokeNotifyTelegram({
    text: msg,
    channel: "internal",
    parseMode: options?.parseMode ?? "HTML",
    internalWarehouseId: options?.warehouseId,
    recipientUserIds: options?.recipientUserIds,
    internalDispatchId: options?.internalDispatchId,
  });
}

export async function notifyWarehouseEvent(input: {
  event: TelegramEvent;
  soPhieu: string;
  khoXuat?: string;
  khoNhan?: string;
  extra?: string;
}): Promise<TelegramNotifyResult> {
  return notifyTelegram(buildWarehouseTelegramText(input));
}
