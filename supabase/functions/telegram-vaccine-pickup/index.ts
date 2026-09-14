/**
 * Cron: nhắc lấy vaccine theo khung giờ kho nhận.
 * Bot: @xuatluuchuong. Group: Nhắc_lấy_Vaccin (-5485142172).
 * - 11:00 VN  → PH, Q8, Q5
 * - 12:30 VN  → Q4 Mới (Q4_275), Q4 Cũ (Q4_178), Q1
 * Chỉ phiếu DH/DT/DC pending|processing, packing_date = hôm nay VN, mã hàng chứa VAC.
 *
 * Body (JSON): { slot: "noon" | "afternoon", date?: "YYYY-MM-DD", dryRun?: true, notifyEmpty?: true }
 * - dryRun: chỉ trả về preview, không gửi Telegram (dùng để test tay).
 * - notifyEmpty (hoặc secret TELEGRAM_VACCINE_NOTIFY_EMPTY=1): vẫn nhắn khi không có phiếu vaccine.
 * Header: x-k9-cron-token = telegram_scheduled_job_tokens.token (job_name = 'vaccine-pickup').
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

type Slot = "noon" | "afternoon";

const SLOT_WAREHOUSES: Record<Slot, { codes: string[]; label: string; time: string }> = {
  noon: {
    codes: ["PH", "Q8", "Q5"],
    label: "PH · Q8 · Q5",
    time: "11:00",
  },
  afternoon: {
    codes: ["Q4_275", "Q4_178", "Q1"],
    label: "Q4 Mới · Q4 Cũ · Q1",
    time: "12:30",
  },
};

const CODE_LABEL: Record<string, string> = {
  PH: "PH",
  Q8: "Q8",
  Q5: "Q5",
  Q1: "Q1",
  Q4_275: "Q4 Mới",
  Q4_178: "Q4 Cũ",
};

function vnToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isVacSku(slug: string | null | undefined) {
  return /VAC/i.test(String(slug || ""));
}

function parseSlot(raw: unknown): Slot | null {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "noon" || s === "11" || s === "11h" || s === "1100") return "noon";
  if (s === "afternoon" || s === "1230" || s === "12h30") return "afternoon";
  return null;
}

/** Cho phép test tay: body.date = "YYYY-MM-DD" (ngày soạn VN). */
function parseDate(raw: unknown): string | null {
  const s = String(raw || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function isTruthy(raw: unknown): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

type TelegramResult = {
  ok: boolean;
  description?: string;
  parameters?: { migrate_to_chat_id?: number };
};

/**
 * Gửi tin nhắn; nếu group đã nâng cấp lên supergroup (chat_id đổi sang -100…)
 * Telegram trả `migrate_to_chat_id` → gửi lại vào id mới.
 */
async function sendTelegram(
  botToken: string,
  chatId: string,
  text: string,
): Promise<{ ok: boolean; chatId: string; migratedTo?: string; error?: string }> {
  const apiBase = Deno.env.get("TELEGRAM_API_BASE") || "https://api.telegram.org";
  const call = async (id: string): Promise<TelegramResult> => {
    const res = await fetch(`${apiBase}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: id,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    try {
      return (await res.json()) as TelegramResult;
    } catch {
      return { ok: false, description: `HTTP ${res.status}` };
    }
  };

  const first = await call(chatId);
  if (first.ok) return { ok: true, chatId };

  const migrated = first.parameters?.migrate_to_chat_id;
  if (migrated) {
    const newId = String(migrated);
    console.warn(
      `[vaccine-pickup] chat ${chatId} đã nâng cấp supergroup → ${newId}. Cập nhật secret TELEGRAM_VACCINE_CHAT_ID=${newId}.`,
    );
    const second = await call(newId);
    if (second.ok) return { ok: true, chatId: newId, migratedTo: newId };
    return {
      ok: false,
      chatId: newId,
      migratedTo: newId,
      error: second.description || "Telegram API error",
    };
  }

  return { ok: false, chatId, error: first.description || "Telegram API error" };
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const botToken =
    Deno.env.get("TELEGRAM_INTERNAL_BOT_TOKEN") ||
    Deno.env.get("TELEGRAM_BOT_TOKEN") ||
    "";
  /** Group Nhắc_lấy_Vaccin — không dùng group xuất nội bộ. */
  const groupChatId =
    Deno.env.get("TELEGRAM_VACCINE_CHAT_ID") ||
    "-5485142172";
  const requestToken = req.headers.get("x-k9-cron-token") || "";
  if (!url || !serviceKey || !botToken || !groupChatId || !requestToken) {
    return json({ error: "Server configuration error" }, 500);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: jobToken } = await admin
    .from("telegram_scheduled_job_tokens")
    .select("token")
    .eq("job_name", "vaccine-pickup")
    .eq("token", requestToken)
    .maybeSingle();
  if (!jobToken) return json({ error: "Unauthorized" }, 401);

  let slot: Slot | null = null;
  let dateOverride: string | null = null;
  let dryRun = false;
  let notifyEmpty = isTruthy(Deno.env.get("TELEGRAM_VACCINE_NOTIFY_EMPTY"));
  try {
    const body = (await req.json()) as {
      slot?: string;
      date?: string;
      dryRun?: unknown;
      notifyEmpty?: unknown;
    };
    slot = parseSlot(body?.slot);
    dateOverride = parseDate(body?.date);
    dryRun = isTruthy(body?.dryRun);
    if (body?.notifyEmpty !== undefined) notifyEmpty = isTruthy(body.notifyEmpty);
  } catch {
    slot = null;
  }
  if (!slot) return json({ error: "Thiếu slot (noon | afternoon)" }, 400);

  const cfg = SLOT_WAREHOUSES[slot];
  const today = dateOverride || vnToday();
  console.log(
    `[vaccine-pickup] slot=${slot} date=${today} dryRun=${dryRun} chat=${groupChatId}`,
  );

  const { data: warehouses, error: whErr } = await admin
    .from("warehouses")
    .select("id, code")
    .in("code", cfg.codes);
  if (whErr) return json({ error: whErr.message }, 500);

  const destIds = ((warehouses as { id: string; code: string }[]) || []).map((w) => w.id);
  const codeById = new Map(
    ((warehouses as { id: string; code: string }[]) || []).map((w) => [w.id, w.code]),
  );
  if (!destIds.length) {
    return json({ ok: true, skipped: true, reason: "Không có kho khớp mã", today, slot });
  }

  const { data: orders, error: ordErr } = await admin
    .from("orders")
    .select(
      `
      id, order_code, status, packing_date, warehouse_id,
      order_items ( product_slug, product_name, quantity, unit )
    `,
    )
    .in("order_kind", ["DH", "DT", "DC"])
    .in("status", ["pending", "processing"])
    .eq("packing_date", today)
    .in("warehouse_id", destIds);
  if (ordErr) return json({ error: ordErr.message }, 500);

  type Item = {
    product_slug: string | null;
    product_name: string | null;
    quantity: number | null;
    unit: string | null;
  };
  type OrderRow = {
    id: string;
    order_code: string | null;
    warehouse_id: string | null;
    order_items: Item[] | null;
  };

  const hits: {
    soPhieu: string;
    kho: string;
    lines: { sku: string; name: string; qty: number; unit: string }[];
  }[] = [];

  for (const o of (orders as OrderRow[]) || []) {
    const vacLines = (o.order_items || []).filter((it) => isVacSku(it.product_slug));
    if (!vacLines.length) continue;
    const code = codeById.get(o.warehouse_id || "") || "";
    hits.push({
      soPhieu: o.order_code || o.id.slice(0, 8),
      kho: CODE_LABEL[code] || code || "—",
      lines: vacLines.map((it) => ({
        sku: String(it.product_slug || "").trim(),
        name: String(it.product_name || "").trim(),
        qty: Number(it.quantity) || 0,
        unit: String(it.unit || "").trim() || "cái",
      })),
    });
  }

  const scanned = ((orders as OrderRow[]) || []).length;
  console.log(
    `[vaccine-pickup] scanned=${scanned} vaccineOrders=${hits.length} warehouses=${cfg.codes.join(",")}`,
  );

  const summary = {
    today,
    slot,
    scannedOrders: scanned,
    orderCount: hits.length,
    soPhieu: hits.map((h) => h.soPhieu),
  };

  let text: string;
  if (!hits.length) {
    if (!notifyEmpty) {
      return json({ ok: true, sent: false, ...summary });
    }
    text = [
      `💉 <b>NHẮC LẤY VACCINE — ${escapeHtml(cfg.time)}</b>`,
      `Kho: <b>${escapeHtml(cfg.label)}</b>`,
      `Ngày soạn: <b>${escapeHtml(today)}</b>`,
      "",
      "Hôm nay không có phiếu vaccine cho khung giờ này.",
    ].join("\n");
  } else {
    const lines: string[] = [
      `💉 <b>NHẮC LẤY VACCINE — ${escapeHtml(cfg.time)}</b>`,
      `Kho: <b>${escapeHtml(cfg.label)}</b>`,
      `Ngày soạn: <b>${escapeHtml(today)}</b>`,
      "",
    ];
    for (const h of hits) {
      lines.push(`• <b>${escapeHtml(h.soPhieu)}</b> · ${escapeHtml(h.kho)}`);
      for (const it of h.lines) {
        const name = it.name ? ` — ${escapeHtml(it.name)}` : "";
        lines.push(
          `   ${escapeHtml(it.sku)}${name} × <b>${it.qty}</b> ${escapeHtml(it.unit)}`,
        );
      }
    }
    lines.push("", "Vui lòng lấy vaccine đúng khung giờ.");
    text = lines.join("\n");
  }

  if (dryRun) {
    return json({ ok: true, sent: false, dryRun: true, ...summary, preview: text });
  }

  const tg = await sendTelegram(botToken, groupChatId, text);
  if (!tg.ok) {
    console.error(`[vaccine-pickup] Telegram lỗi (chat ${tg.chatId}): ${tg.error}`);
    return json({ error: tg.error || "Telegram API error", chatId: tg.chatId, ...summary }, 502);
  }

  return json({
    ok: true,
    sent: true,
    chatId: tg.chatId,
    ...(tg.migratedTo ? { migratedTo: tg.migratedTo } : {}),
    ...summary,
  });
});
