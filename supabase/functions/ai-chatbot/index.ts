// Supabase Edge Function for AI Chatbot using DeepSeek API
// Deploy: supabase functions deploy ai-chatbot
// Set secret: supabase secrets set DEEPSEEK_API_KEY=sk-your-key-here

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

interface ChatRequest {
  message: string;
  conversationId?: string;
  sessionId: string;
  context?: {
    currentPage?: string;
    cartItems?: string[];
  };
}

interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { 
      status: 200,
      headers: corsHeaders 
    });
  }

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get DeepSeek API key from secrets (NEVER expose this to frontend!)
    const deepseekApiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!deepseekApiKey) {
      console.error("DEEPSEEK_API_KEY not set");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: ChatRequest = await req.json();
    const { message, conversationId, sessionId, context } = body;

    // Validate input
    if (!message || !sessionId || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Message and sessionId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (message.length > 1000) {
      return new Response(
        JSON.stringify({ error: "Message too long (max 1000 characters)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get or create conversation
    let convId = conversationId;
    if (!convId) {
      const { data: convData, error: convError } = await supabase.rpc(
        "get_or_create_conversation",
        {
          p_session_id: sessionId,
          p_user_id: null, // Will be set if user is authenticated
        }
      );
      if (convError) throw convError;
      convId = convData;
    }

    // Smart product filtering: Extract keywords from user message
    const messageLower = message.toLowerCase();
    const keywords = messageLower
      .split(/\s+/)
      .filter((w) => w.length > 2 && !["tôi", "bạn", "của", "cho", "với", "và", "hoặc", "muốn", "cần", "tìm"].includes(w));

    // Build product context with smart filtering
    let productsQuery = supabase
      .from("products")
      .select("id, name, price, original_price, category, description")
      .eq("is_active", true);

    // Filter by category if mentioned
    const categoryMatch = messageLower.match(/(danh mục|loại|category):\s*(\w+)/);
    if (categoryMatch) {
      productsQuery = productsQuery.ilike("category", `%${categoryMatch[2]}%`);
    } else if (keywords.length > 0) {
      // Filter by first keyword in name (simpler approach)
      const firstKeyword = keywords[0];
      productsQuery = productsQuery.ilike("name", `%${firstKeyword}%`);
    }

    const { data: products = [] } = await productsQuery
      .order("created_at", { ascending: false })
      .limit(15); // Reduced from 50 to 15

    // Build compact product context
    const productContext = products
      .map((p) => {
        const price = new Intl.NumberFormat("vi-VN").format(Number(p.price)) + "₫";
        const originalPrice = p.original_price
          ? new Intl.NumberFormat("vi-VN").format(Number(p.original_price)) + "₫"
          : null;
        const shortDesc = p.description?.substring(0, 80).replace(/\n/g, " ") || ""; // Reduced from 200 to 80
        return `${p.id}|${p.name}|${price}${originalPrice ? `|${originalPrice}` : ""}|${p.category || ""}|${shortDesc}`;
      })
      .join("\n");

    // Build compact system prompt, nhấn mạnh bắt buộc gợi ý và gắn thẻ sản phẩm,
    // đồng thời định nghĩa format câu trả lời thân thiện, dễ đọc.
    const systemPrompt = `Bạn là AI tư vấn sản phẩm cho thương hiệu Tăm Nhựa Vinon.
Nhiệm vụ chính:
- Tư vấn và gợi ý sản phẩm phù hợp nhu cầu khách hàng.
- Luôn ưu tiên đề xuất sản phẩm cụ thể để khách dễ mua hàng.
- Hỗ trợ đặt hàng, giải đáp thắc mắc về sản phẩm.

Quy tắc trả lời (UI/UX đẹp, dễ đọc):
1) Mở đầu: 1–2 câu chào và tóm tắt nhanh bạn hiểu nhu cầu gì.
2) Phần gợi ý: liệt kê 1–3 sản phẩm dưới dạng gạch đầu dòng, mỗi dòng tối đa 1–2 câu, ví dụ:
   - [Tên sản phẩm]: Lợi ích chính, phù hợp với nhu cầu X, dùng cho đối tượng Y...
   - [Tên sản phẩm]: Ưu điểm nổi bật A, B...
3) Kết thúc: 1 câu gợi ý khách có thể đặt hàng hoặc hỏi thêm nếu còn thắc mắc.
4) Không chèn ID sản phẩm, giá trị kỹ thuật hoặc tag vào nội dung hiển thị cho khách.

QUAN TRỌNG – Định dạng kỹ thuật (frontend sẽ đọc các tag ẩn để hiển thị thẻ sản phẩm & nút mua, khách không thấy các tag này):
- Với mỗi sản phẩm được gợi ý, PHẢI thêm tag: [PRODUCT:id_sản_phẩm]
- Nếu khuyến khích khách mua ngay: thêm tag: [ACTION:add_to_cart:id_sản_phẩm]
- Nếu chỉ gợi ý xem chi tiết: dùng tag: [ACTION:view_product:id_sản_phẩm]
- Các tag này có thể đặt ở cuối câu, không giải thích lại bản thân tag, và coi như phần ẩn kỹ thuật.

Ví dụ ngắn (chỉ minh họa, KHÔNG cần nhắc lại y chang):
- Nội dung hiển thị: "Bạn có thể tham khảo sản phẩm A, phù hợp để làm sạch kẽ răng hằng ngày, dễ dùng cho cả gia đình."
- Tag kỹ thuật (ẩn): [PRODUCT:uuid_san_pham_A] [ACTION:view_product:uuid_san_pham_A]

Danh sách sản phẩm (format: id|tên|giá|giá_gốc|danh_mục|mô_tả_ngắn):
${productContext}`;

    // Load conversation history (reduced from 10 to 6 messages to save tokens)
    const { data: history = [] } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .limit(6);

    // Build messages array for DeepSeek
    const messages: DeepSeekMessage[] = [
      { role: "system", content: systemPrompt },
      ...history.reverse().map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user", content: message },
    ];

    // Save user message
    await supabase.from("chat_messages").insert({
      conversation_id: convId,
      role: "user",
      content: message,
    });

    // Call DeepSeek API
    const deepseekResponse = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: messages,
        temperature: 0.7,
        max_tokens: 800, // Reduced from 1000 to save tokens
      }),
    });

    if (!deepseekResponse.ok) {
      const errorText = await deepseekResponse.text();
      console.error("DeepSeek API error:", deepseekResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Xin lỗi, có lỗi xảy ra. Vui lòng thử lại sau." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const deepseekData = await deepseekResponse.json();
    const assistantMessage = deepseekData.choices?.[0]?.message?.content || "Xin lỗi, tôi không thể trả lời lúc này.";

    // Parse response for product suggestions and actions
    const productMatches = assistantMessage.match(/\[PRODUCT:([^\]]+)\]/g) || [];
    const actionMatches = assistantMessage.match(/\[ACTION:([^\]]+)\]/g) || [];

    const suggestedProductIds = productMatches
      .map((m) => m.match(/\[PRODUCT:([^\]]+)\]/)?.[1])
      .filter(Boolean) as string[];
    
    const actions = actionMatches
      .map((m) => {
        const match = m.match(/\[ACTION:(\w+):([^\]]+)\]/);
        return match ? { type: match[1], productId: match[2] } : null;
      })
      .filter(Boolean) as Array<{ type: string; productId: string }>;

    // Fetch suggested products
    let suggestedProducts: any[] = [];
    if (suggestedProductIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("id, name, slug, price, original_price, image_url, badge, stock_quantity")
        .in("id", suggestedProductIds)
        .eq("is_active", true);
      suggestedProducts = products || [];
    }

    // Clean response (remove special markers)
    const cleanResponse = assistantMessage
      .replace(/\[PRODUCT:[^\]]+\]/g, "")
      .replace(/\[ACTION:[^\]]+\]/g, "")
      .trim();

    // Save assistant message with full product data in metadata
    await supabase.from("chat_messages").insert({
      conversation_id: convId,
      role: "assistant",
      content: cleanResponse,
      metadata: {
        suggestedProducts: suggestedProductIds,
        suggestedProductsData: suggestedProducts, // Include full product data
        actions: actions,
      },
    });

    // Return response
    return new Response(
      JSON.stringify({
        message: cleanResponse,
        conversationId: convId,
        suggestedProducts: suggestedProducts,
        actions: actions,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in ai-chatbot function:", error);
    return new Response(
      JSON.stringify({ error: "Không thể kết nối. Vui lòng kiểm tra internet và thử lại." }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

