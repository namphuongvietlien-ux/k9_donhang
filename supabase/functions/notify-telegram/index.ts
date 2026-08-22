/**
 * Edge Function: báo Telegram (port GAS sendTelegram*).
 *
 * Secrets:
 * - TELEGRAM_BOT_TOKEN            (bắt buộc — bot chung)
 * - TELEGRAM_CHAT_ID              (group đơn khách lẻ / nghiệp vụ chung)
 * - TELEGRAM_INTERNAL_BOT_TOKEN   (tùy chọn — bot riêng kênh nội bộ; thiếu thì fallback TELEGRAM_BOT_TOKEN)
 * - TELEGRAM_INTERNAL_CHAT_ID     (group nội bộ)
 *
 * Body: {
 *   text: string,
 *   chatId?: string,
 *   channel?: 'internal',
 *   parseMode?: 'HTML' | null,      // null/không truyền = gửi plain text (an toàn nhất)
 *   internalWarehouseId?: string,
 *   recipientUserIds?: string[],
 *   internalDispatchId?: string,
 * }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

type SendResult = {
  chatId: string;
  ok: boolean;
  description?: string;
};

/**
 * Gửi 1 tin. Nếu Telegram từ chối vì lỗi parse HTML (tên hàng/kho có ký tự
 * `&`, `<`, `>`), gửi lại dạng plain text để tin nhắn không bị mất.
 */
async function sendTelegram(
  token: string,
  chatId: string,
  text: string,
  options?: {
    parseMode?: "HTML" | null;
    replyMarkup?: Record<string, unknown>;
  },
): Promise<SendResult> {
  const parseMode = options?.parseMode ?? null;

  const post = async (body: Record<string, unknown>) => {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    let payload: Record<string, unknown> | null = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return {
      httpOk: response.ok,
      apiOk: !!payload?.ok,
      description: String(payload?.description || `HTTP ${response.status}`),
    };
  };

  const base: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };
  if (options?.replyMarkup) base.reply_markup = options.replyMarkup;

  const first = await post(
    parseMode ? { ...base, parse_mode: parseMode } : base,
  );
  if (first.httpOk && first.apiOk) return { chatId, ok: true };

  // Retry không parse_mode khi lỗi do entities — giữ được nội dung tin nhắn.
  if (parseMode && /can't parse entities|unsupported start tag|can't find end/i.test(first.description)) {
    const retry = await post(base);
    if (retry.httpOk && retry.apiOk) return { chatId, ok: true };
    return { chatId, ok: false, description: retry.description };
  }

  return { chatId, ok: false, description: first.description };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  try {
    const body = (await req.json()) as {
      text?: string;
      chatId?: string;
      channel?: "internal";
      parseMode?: "HTML" | null;
      internalWarehouseId?: string;
      recipientUserIds?: string[];
      internalDispatchId?: string;
    };

    const isInternal = body.channel === "internal";
    const sharedToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
    const internalToken = Deno.env.get("TELEGRAM_INTERNAL_BOT_TOKEN") || "";
    // Kênh nội bộ ưu tiên bot riêng, nhưng KHÔNG được im lặng khi chỉ có bot chung.
    const token = isInternal ? internalToken || sharedToken : sharedToken;

    if (!token) {
      return new Response(
        JSON.stringify({
          ok: false,
          skipped: true,
          reason: "missing_token",
          error: isInternal
            ? "Chưa cấu hình TELEGRAM_INTERNAL_BOT_TOKEN hoặc TELEGRAM_BOT_TOKEN"
            : "Chưa cấu hình TELEGRAM_BOT_TOKEN",
        }),
        { status: 200, headers: jsonHeaders },
      );
    }

    const text = String(body.text || "").trim();
    if (!text) {
      return new Response(JSON.stringify({ ok: false, error: "Thiếu text" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const parseMode = body.parseMode === "HTML" ? "HTML" : null;
    const defaultChat = Deno.env.get("TELEGRAM_CHAT_ID") || "";
    const internalChat = Deno.env.get("TELEGRAM_INTERNAL_CHAT_ID") || "";
    const chatIds = new Set<string>();

    if (body.chatId) {
      chatIds.add(body.chatId);
    } else if (isInternal) {
      if (internalChat) chatIds.add(internalChat);

      const authHeader = req.headers.get("Authorization") || "";
      const url = Deno.env.get("SUPABASE_URL") || "";
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      const auth = createClient(url, anonKey, { auth: { persistSession: false } });
      const { data: { user } } = await auth.auth.getUser(
        authHeader.replace(/^Bearer\s+/i, ""),
      );
      if (!user || !serviceKey) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
          status: 401,
          headers: jsonHeaders,
        });
      }
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

      if (body.internalDispatchId) {
        const { data: dispatch, error: dispatchError } = await admin
          .from("internal_dispatches")
          .select(
            "id, dispatch_code, warehouse_id, requested_by, notes, warehouses:warehouse_id(code,name,address), internal_dispatch_items(line_no,product_id,product_code,product_name,unit,quantity, products:product_id(barcode))",
          )
          .eq("id", body.internalDispatchId)
          .maybeSingle();
        if (dispatchError || !dispatch || dispatch.requested_by !== user.id) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Không tìm thấy yêu cầu xuất nội bộ",
            }),
            { status: 404, headers: jsonHeaders },
          );
        }

        const record = dispatch as any;
        const { data: scopes } = await admin
          .from("branch_manager_scopes")
          .select("manager_user_id")
          .eq("warehouse_id", record.warehouse_id);
        const managerIds = [
          ...new Set((scopes || []).map((scope) => scope.manager_user_id)),
        ];
        const { data: subscriptions } = managerIds.length
          ? await admin
            .from("telegram_notification_subscriptions")
            .select("user_id,chat_id")
            .in("user_id", managerIds)
          : { data: [] as { user_id: string; chat_id: string }[] };

        const itemLines = (record.internal_dispatch_items || [])
          .slice()
          .sort((left: any, right: any) => left.line_no - right.line_no)
          .map((item: any) => {
            const barcode = item.products?.barcode || item.product_code;
            return (
              `• Sản phẩm: ${escapeHtml(item.product_name)} ` +
              `(<b>${escapeHtml(barcode)}</b>)` +
              `\n  Số lượng: <b>${escapeHtml(item.quantity)} ${escapeHtml(item.unit || "")}</b>`
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
        // callback_data phải khớp parser của telegram-webhook: dispatch:<action>:<uuid>
        // ("dispatch:approve:" + 36 ký tự UUID = 53 byte, dưới giới hạn 64 byte của Telegram).
        const keyboard = {
          inline_keyboard: [
            [{ text: "✅ Chấp nhận", callback_data: `dispatch:approve:${record.id}` }],
            [{ text: "❌ Từ chối", callback_data: `dispatch:reject:${record.id}` }],
          ],
        };

        const sends: Promise<SendResult>[] = (subscriptions || []).map(
          (subscription) =>
            sendTelegram(token, subscription.chat_id, requestText, {
              parseMode: "HTML",
              replyMarkup: keyboard,
            }),
        );
        if (internalChat) {
          sends.push(sendTelegram(
            token,
            internalChat,
            `${requestText}\n<i>Nút duyệt chỉ gửi trong Telegram riêng của manager.</i>`,
            { parseMode: "HTML" },
          ));
        }
        if (!sends.length) {
          return new Response(
            JSON.stringify({
              ok: false,
              skipped: true,
              reason: "no_recipients",
              error:
                "Chưa có quản lý nào kết nối Telegram và chưa cấu hình TELEGRAM_INTERNAL_CHAT_ID",
            }),
            { status: 200, headers: jsonHeaders },
          );
        }

        const results = await Promise.all(sends);
        const failed = results.filter((result) => !result.ok);
        if (failed.length === results.length) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: failed[0]?.description || "Telegram API lỗi",
              failed,
            }),
            { status: 502, headers: jsonHeaders },
          );
        }
        return new Response(
          JSON.stringify({
            ok: true,
            recipients: results.length - failed.length,
            failed,
          }),
          { status: 200, headers: jsonHeaders },
        );
      }

      const recipientIds = new Set<string>([user.id]);
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
        JSON.stringify({
          ok: false,
          skipped: true,
          reason: "no_recipients",
          error: isInternal
            ? "Chưa cấu hình TELEGRAM_INTERNAL_CHAT_ID và chưa có ai kết nối Telegram"
            : "Chưa cấu hình TELEGRAM_CHAT_ID",
        }),
        { status: 200, headers: jsonHeaders },
      );
    }

    const results = await Promise.all(
      [...chatIds].map((chatId) => sendTelegram(token, chatId, text, { parseMode })),
    );
    const failed = results.filter((result) => !result.ok);
    if (failed.length === results.length) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: failed[0]?.description || "Telegram API lỗi",
          failed,
        }),
        { status: 502, headers: jsonHeaders },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        recipients: results.length - failed.length,
        failed,
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : "Lỗi",
      }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
