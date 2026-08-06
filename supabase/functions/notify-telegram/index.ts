/**
 * Edge Function: báo Telegram (port GAS sendTelegram*).
 * Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *
 * Body: { text: string, chatId?: string }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
    const defaultChat = Deno.env.get("TELEGRAM_CHAT_ID") || "";
    if (!token || !defaultChat) {
      return new Response(
        JSON.stringify({
          ok: false,
          skipped: true,
          error: "Chưa cấu hình TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const body = (await req.json()) as { text?: string; chatId?: string };
    const text = String(body.text || "").trim();
    if (!text) {
      return new Response(JSON.stringify({ error: "Thiếu text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatId = body.chatId || defaultChat;
    const tgRes = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      },
    );
    const tgJson = await tgRes.json();
    if (!tgRes.ok || !tgJson.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: tgJson.description || "Telegram API lỗi",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
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
