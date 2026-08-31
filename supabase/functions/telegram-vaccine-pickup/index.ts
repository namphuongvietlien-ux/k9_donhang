/**
 * Cron: nhắc lấy vaccine theo khung giờ kho nhận.
 * - 12:00 VN  → PH, Q8, Q5
 * - 13:45 VN  → Q4 Mới (Q4_275), Q4 Cũ (Q4_178), Q1
 * Chỉ phiếu DH/DC pending|processing, packing_date = hôm nay VN, mã hàng chứa VAC.
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
    time: "12:00",
  },
  afternoon: {
    codes: ["Q4_275", "Q4_178", "Q1"],
    label: "Q4 Mới · Q4 Cũ · Q1",
    time: "13:45",
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
  if (s === "noon" || s === "12" || s === "12h") return "noon";
  if (s === "afternoon" || s === "1345" || s === "13h45") return "afternoon";
  return null;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const botToken =
    Deno.env.get("TELEGRAM_INTERNAL_BOT_TOKEN") ||
    Deno.env.get("TELEGRAM_BOT_TOKEN") ||
    "";
  const groupChatId =
    Deno.env.get("TELEGRAM_INTERNAL_CHAT_ID") ||
    Deno.env.get("TELEGRAM_CHAT_ID") ||
    "";
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
  try {
    const body = (await req.json()) as { slot?: string };
    slot = parseSlot(body?.slot);
  } catch {
    slot = null;
  }
  if (!slot) return json({ error: "Thiếu slot (noon | afternoon)" }, 400);

  const cfg = SLOT_WAREHOUSES[slot];
  const today = vnToday();

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
    .in("order_kind", ["DH", "DC"])
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

  if (!hits.length) {
    return json({ ok: true, sent: false, today, slot, orderCount: 0 });
  }

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

  const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: groupChatId,
      text: lines.join("\n"),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const telegramBody = await telegramResponse.json();
  if (!telegramResponse.ok || !telegramBody.ok) {
    return json({ error: telegramBody.description || "Telegram API error" }, 502);
  }

  return json({
    ok: true,
    sent: true,
    today,
    slot,
    orderCount: hits.length,
    soPhieu: hits.map((h) => h.soPhieu),
  });
});
