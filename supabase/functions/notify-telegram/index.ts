/**
 * Edge Function: báo Telegram (port GAS sendTelegram*).
 * Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_INTERNAL_CHAT_ID,
 * TELEGRAM_INTERNAL_BOT_TOKEN
 *
 * Body: { text: string, chatId?: string, channel?: 'internal' }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const escapeHtml = (value: unknown) => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

async function sendTelegram(
  token: string,
  chatId: string,
  text: string,
  replyMarkup?: Record<string, unknown>,
) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    }),
  });
  return { ok: response.ok, body: await response.json() };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as {
      text?: string;
      chatId?: string;
      channel?: "internal";
      internalWarehouseId?: string;
      recipientUserIds?: string[];
      internalDispatchId?: string;
    };
    const token = body.channel === "internal"
      ? Deno.env.get("TELEGRAM_INTERNAL_BOT_TOKEN") || ""
      : Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
    const defaultChat = Deno.env.get("TELEGRAM_CHAT_ID") || "";
    if (!token) {
      return new Response(
        JSON.stringify({
          ok: false,
          skipped: true,
          error: "Chưa cấu hình TELEGRAM_BOT_TOKEN",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const text = String(body.text || "").trim();
    if (!text) {
      return new Response(JSON.stringify({ error: "Thiếu text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const internalChat = Deno.env.get("TELEGRAM_INTERNAL_CHAT_ID") || "";
    const chatIds = new Set<string>();
    if (body.chatId) chatIds.add(body.chatId);
    else if (body.channel === "internal") {
      if (internalChat) chatIds.add(internalChat);
      const authHeader = req.headers.get("Authorization") || "";
      const url = Deno.env.get("SUPABASE_URL") || "";
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      const auth = createClient(url, anonKey, { auth: { persistSession: false } });
      const { data: { user } } = await auth.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
      if (!user || !serviceKey) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

      if (body.internalDispatchId) {
        const { data: dispatch, error: dispatchError } = await admin
          .from("internal_dispatches")
          .select("id, dispatch_code, warehouse_id, requested_by, notes, warehouses:warehouse_id(code,name,address), internal_dispatch_items(line_no,product_id,product_code,product_name,unit,quantity, products:product_id(barcode))")
          .eq("id", body.internalDispatchId)
          .maybeSingle();
        if (dispatchError || !dispatch || dispatch.requested_by !== user.id) {
          return new Response(JSON.stringify({ error: "Không tìm thấy yêu cầu xuất nội bộ" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const record = dispatch as any;
        const { data: scopes } = await admin
          .from("branch_manager_scopes")
          .select("manager_user_id")
          .eq("warehouse_id", record.warehouse_id);
        const managerIds = new Set((scopes || []).map((scope) => scope.manager_user_id));
        const { data: subscriptions } = await admin
          .from("telegram_notification_subscriptions")
          .select("user_id,chat_id")
          .in("user_id", [...managerIds]);
        const itemLines = (record.internal_dispatch_items || [])
          .sort((left: any, right: any) => left.line_no - right.line_no)
          .map((item: any) => {
            const barcode = item.products?.barcode || item.product_code;
            return (
            `• Sản phẩm: ${escapeHtml(item.product_name)} ` +
            `(<b>${escapeHtml(barcode)}</b>)` +
            `\n  Số lượng: <b>${item.quantity} ${escapeHtml(item.unit || "")}</b>`,
            );
          })
          .join("\n");
        const warehouseName = record.warehouses?.name || record.warehouses?.code || "—";
        const warehouseAddress = String(record.warehouses?.address || "").trim();
        const creator = user.email || user.user_metadata?.full_name || "—";
        const requestText = [
          "📦 <b>YÊU CẦU XUẤT NỘI BỘ</b>",
          `Mã đơn: <b>${escapeHtml(record.dispatch_code)}</b>`,
          `Người tạo: <b>${escapeHtml(creator)}</b>`,
          `• Cửa hàng: <b>${escapeHtml(warehouseName)}</b>${warehouseAddress ? `\n  ${escapeHtml(warehouseAddress)}` : ""}`,
          "",
          itemLines || "—",
          "",
          `<b>Ghi chú:</b> ${escapeHtml(record.notes || "Không có")}`,
          "",
          "<b>Chọn thao tác:</b>",
        ].join("\n");
        const keyboard = {
          inline_keyboard: [
            [{ text: "✅ Duyệt đơn", callback_data: `dispatch:approve:${record.id}` }],
            [{ text: "❌ Không duyệt", callback_data: `dispatch:reject:${record.id}` }],
          ],
        };
        const sends = (subscriptions || []).map((subscription) =>
          sendTelegram(token, subscription.chat_id, requestText, keyboard),
        );
        if (internalChat) {
          sends.push(sendTelegram(
            token,
            internalChat,
            `${requestText}\n<i>Nút duyệt chỉ gửi trong Telegram riêng của manager.</i>`,
          ));
        }
        const results = await Promise.all(sends);
        const failed = results.find((result) => !result.ok || !result.body?.ok);
        if (failed) throw new Error(failed.body?.description || "Telegram API lỗi");
        return new Response(JSON.stringify({ ok: true, recipients: sends.length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const recipientIds = new Set([user.id]);
      for (const recipientId of body.recipientUserIds || []) {
        if (typeof recipientId === "string" && recipientId) recipientIds.add(recipientId);
      }
      if (body.internalWarehouseId) {
        const { data: scopes } = await admin
          .from("branch_manager_scopes")
          .select("manager_user_id")
          .eq("warehouse_id", body.internalWarehouseId);
        for (const scope of scopes || []) recipientIds.add(scope.manager_user_id);
      }
      const { data: subscriptions } = await admin
        .from("telegram_notification_subscriptions")
        .select("chat_id")
        .in("user_id", [...recipientIds]);
      for (const subscription of subscriptions || []) chatIds.add(subscription.chat_id);
    } else if (defaultChat) {
      chatIds.add(defaultChat);
    }
    if (!chatIds.size) {
      return new Response(
        JSON.stringify({ ok: false, skipped: true, error: "Chưa cấu hình Telegram group nội bộ" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const results = await Promise.all(
      [...chatIds].map(async (chatId) => {
        return sendTelegram(token, chatId, text);
      }),
    );
    const failed = results.find((result) => !result.ok || !result.body?.ok);
    if (failed) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: failed.body?.description || "Telegram API lỗi",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ ok: true, recipients: chatIds.size }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : "Lỗi",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
