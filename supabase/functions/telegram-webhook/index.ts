import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

async function reply(token: string, chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function telegramApi(token: string, method: string, body: Record<string, unknown>) {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const webhookSecret = Deno.env.get("TELEGRAM_INTERNAL_WEBHOOK_SECRET") || "";
  if (!webhookSecret || req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== webhookSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const update = await req.json();
  const token = Deno.env.get("TELEGRAM_INTERNAL_BOT_TOKEN") || "";
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
  const callback = update?.callback_query;

  if (callback?.data?.startsWith("dispatch:")) {
    const [, action, dispatchId] = String(callback.data).split(":");
    const chatId = String(callback.message?.chat?.id || "");
    const messageId = callback.message?.message_id;
    const query = new URLSearchParams({ chat_id: `eq.${chatId}`, select: "user_id" });
    const subscriptionResponse = await fetch(
      `${url}/rest/v1/telegram_notification_subscriptions?${query}`,
      { headers },
    );
    const [subscription] = await subscriptionResponse.json();

    if (!subscription || !dispatchId || !["approve", "reject"].includes(action)) {
      await telegramApi(token, "answerCallbackQuery", {
        callback_query_id: callback.id,
        text: "Bạn không có quyền xử lý yêu cầu này.",
        show_alert: true,
      });
      return new Response("ok");
    }

    const decisionResponse = await fetch(
      `${url}/rest/v1/rpc/telegram_decide_internal_dispatch`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          _dispatch_id: dispatchId,
          _manager_user_id: subscription.user_id,
          _approved: action === "approve",
        }),
      },
    );
    const decision = await decisionResponse.json();
    if (!decisionResponse.ok) {
      await telegramApi(token, "answerCallbackQuery", {
        callback_query_id: callback.id,
        text: decision?.message || "Đơn đã được xử lý hoặc bạn không có quyền.",
        show_alert: true,
      });
      return new Response("ok");
    }

    const result = Array.isArray(decision) ? decision[0] : decision;
    const approved = action === "approve";
    const statusText = approved ? "✅ ĐÃ DUYỆT" : "❌ KHÔNG DUYỆT";
    await telegramApi(token, "answerCallbackQuery", {
      callback_query_id: callback.id,
      text: approved ? "Đã duyệt đơn." : "Đã từ chối đơn.",
    });
    await telegramApi(token, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: `${callback.message.text}\n\n<b>${statusText}</b>`,
      parse_mode: "HTML",
    });

    const requesterQuery = new URLSearchParams({ user_id: `eq.${result.requested_by}`, select: "chat_id" });
    const requesterResponse = await fetch(
      `${url}/rest/v1/telegram_notification_subscriptions?${requesterQuery}`,
      { headers },
    );
    const [requester] = await requesterResponse.json();
    const updateText = `${statusText}\nMã đơn: <b>${result.dispatch_code}</b>${approved ? "\nĐơn đã được cộng vào Đơn tuần." : "\nVui lòng kiểm tra và tạo lại yêu cầu khi cần."}`;
    if (requester?.chat_id) {
      await telegramApi(token, "sendMessage", {
        chat_id: requester.chat_id,
        text: updateText,
        parse_mode: "HTML",
      });
    }
    const internalChat = Deno.env.get("TELEGRAM_INTERNAL_CHAT_ID") || "";
    if (internalChat) {
      await telegramApi(token, "sendMessage", {
        chat_id: internalChat,
        text: updateText,
        parse_mode: "HTML",
      });
    }
    return new Response("ok");
  }

  const message = update?.message;
  const text = String(message?.text || "").trim();
  const chatId = String(message?.chat?.id || "");
  const chatType = String(message?.chat?.type || "");
  if (!chatId || !text.startsWith("/start")) return new Response("ok");

  if (chatType === "group" || chatType === "supergroup") {
    await reply(
      token,
      chatId,
      `Mã nhóm quản lý: ${chatId}\nGửi mã này cho quản trị viên để bật nhận thông báo đơn xuất nội bộ.`,
    );
    return new Response("ok");
  }

  const linkToken = text.split(/\s+/, 2)[1] || "";
  if (!linkToken || !token) {
    await reply(token, chatId, "Mở liên kết Kết nối Telegram từ portal để đăng ký nhận thông báo.");
    return new Response("ok");
  }

  const query = new URLSearchParams({
    token: `eq.${linkToken}`,
    expires_at: `gt.${new Date().toISOString()}`,
    select: "token,user_id",
  });
  const linkResponse = await fetch(
    `${url}/rest/v1/telegram_link_tokens?${query}`,
    { headers },
  );
  const [link] = await linkResponse.json();

  if (!link) {
    await reply(token, chatId, "Liên kết đã hết hạn hoặc không hợp lệ. Hãy tạo liên kết mới từ portal.");
    return new Response("ok");
  }

  const saveResponse = await fetch(
    `${url}/rest/v1/telegram_notification_subscriptions?on_conflict=user_id`,
    {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        user_id: link.user_id,
        chat_id: chatId,
        chat_username: message?.chat?.username || null,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  await fetch(`${url}/rest/v1/telegram_link_tokens?token=eq.${linkToken}`, {
    method: "DELETE",
    headers,
  });
  await reply(token, chatId, saveResponse.ok ? "Đã kết nối. Bạn sẽ nhận thông báo đơn xuất nội bộ tại đây." : "Không thể kết nối Telegram. Hãy thử lại từ portal.");
  return new Response("ok");
});
