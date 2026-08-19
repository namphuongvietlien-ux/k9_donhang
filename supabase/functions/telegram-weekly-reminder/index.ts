import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const botToken = Deno.env.get("TELEGRAM_INTERNAL_BOT_TOKEN") || "";
  const groupChatId = Deno.env.get("TELEGRAM_INTERNAL_CHAT_ID") || "";
  const requestToken = req.headers.get("x-k9-cron-token") || "";
  if (!url || !serviceKey || !botToken || !groupChatId || !requestToken) {
    return json({ error: "Server configuration error" }, 500);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: jobToken } = await admin
    .from("telegram_scheduled_job_tokens")
    .select("token")
    .eq("job_name", "weekly-internal-reminder")
    .eq("token", requestToken)
    .maybeSingle();
  if (!jobToken) return json({ error: "Unauthorized" }, 401);

  const today = new Date().toISOString().slice(0, 10);
  const [{ count: pendingWeeklyOrders, error: weeklyError }, { count: pendingDispatches, error: dispatchError }] = await Promise.all([
    admin
      .from("weekly_orders")
      .select("id", { count: "exact", head: true })
      .neq("status", "processed")
      .lte("week_start", today),
    admin
      .from("internal_dispatches")
      .select("id", { count: "exact", head: true })
      .eq("status", "manager_approved"),
  ]);
  if (weeklyError || dispatchError) {
    return json({ error: weeklyError?.message || dispatchError?.message || "Query failed" }, 500);
  }

  const weeklyCount = pendingWeeklyOrders || 0;
  const dispatchCount = pendingDispatches || 0;
  const message = weeklyCount || dispatchCount
    ? [
        "⏰ <b>NHẮC VIỆC CUỐI TUẦN</b>",
        `• Đơn tuần chưa Tổng công ty xử lý: <b>${weeklyCount}</b>`,
        `• Yêu cầu đã quản lý duyệt chờ xử lý: <b>${dispatchCount}</b>`,
        "",
        "Vui lòng kiểm tra và hoàn tất các đơn còn tồn.",
      ].join("\n")
    : [
        "✅ <b>NHẮC VIỆC CUỐI TUẦN</b>",
        "Không còn đơn tuần hoặc yêu cầu xuất nội bộ chờ Tổng công ty xử lý.",
      ].join("\n");

  const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: groupChatId,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const telegramBody = await telegramResponse.json();
  if (!telegramResponse.ok || !telegramBody.ok) {
    return json({ error: telegramBody.description || "Telegram API error" }, 502);
  }

  return json({ ok: true, pendingWeeklyOrders: weeklyCount, pendingDispatches: dispatchCount });
});
