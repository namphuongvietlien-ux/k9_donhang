import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

interface RequestBody {
  email: string;
  otpCode: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    // Only allow POST
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Get Supabase environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase environment variables");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Get authorization header and verify JWT manually
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Extract JWT token from Authorization header
    const token = authHeader.replace("Bearer ", "");

    // Create Supabase client with anon key
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    // Verify JWT token and get user
    const {
      data: { user: currentUser },
      error: userError,
    } = await supabaseClient.auth.getUser(token);

    if (userError || !currentUser) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ 
          error: "Unauthorized",
          details: userError?.message || "Invalid or expired token",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const { email, otpCode }: RequestBody = await req.json();

    // Validate that the authenticated user has admin role
    // Use RPC function can_access_admin (SECURITY DEFINER) to bypass RLS
    const { data: canAccess, error: canAccessError } = await supabaseClient.rpc('can_access_admin', {
      _user_id: currentUser.id
    });

    if (canAccessError || !canAccess) {
      console.error("User does not have admin role:", canAccessError);
      console.error("User ID:", currentUser.id);
      console.error("User email:", currentUser.email);
      return new Response(
        JSON.stringify({ 
          error: "Unauthorized: User does not have admin role",
          details: canAccessError?.message || "User does not have admin role in user_roles table"
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Validate that the email matches the authenticated user's email
    if (email.toLowerCase() !== currentUser.email?.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Email does not match authenticated user" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Send OTP email via Resend
    // Use Resend's default domain or configured domain from environment variable
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "Tăm Vinon Admin <onboarding@resend.dev>";
    
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: "Mã xác thực đăng nhập Admin - Tăm Vinon",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0;">Tăm Vinon Admin</h1>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
              <h2 style="color: #333; margin-top: 0;">Mã xác thực đăng nhập</h2>
              <p>Xin chào,</p>
              <p>Bạn đang cố gắng đăng nhập vào hệ thống quản trị Tăm Vinon. Vui lòng sử dụng mã xác thực sau:</p>
              <div style="background: white; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
                <h1 style="color: #667eea; font-size: 36px; letter-spacing: 8px; margin: 0; font-family: 'Courier New', monospace;">${otpCode}</h1>
              </div>
              <p style="color: #666; font-size: 14px;">Mã này có hiệu lực trong <strong>10 phút</strong>.</p>
              <p style="color: #666; font-size: 14px;">Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; text-align: center;">Email này được gửi tự động, vui lòng không trả lời.</p>
            </div>
          </body>
          </html>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text().catch(() => "Unknown error");
      console.error("Resend API error:", errorData);
      
      let errorMessage = "Failed to send email";
      if (emailResponse.status === 401) {
        errorMessage = "RESEND_API_KEY không hợp lệ hoặc chưa được cấu hình. Vui lòng kiểm tra Supabase Secrets.";
      } else if (emailResponse.status === 403) {
        // Parse error to check if it's a domain verification issue
        try {
          const errorJson = JSON.parse(errorData);
          if (errorJson.message?.includes("domain is not verified")) {
            errorMessage = `Domain chưa được verify trong Resend. Vui lòng verify domain "${errorJson.message.match(/domain[^"]*"([^"]+)"/)?.[1] || 'vinon.com'}" tại https://resend.com/domains hoặc sử dụng domain mặc định onboarding@resend.dev bằng cách set RESEND_FROM_EMAIL trong Supabase Secrets.`;
          } else {
            errorMessage = "Resend API key không có quyền gửi email. Vui lòng kiểm tra API key.";
          }
        } catch {
          errorMessage = "Resend API key không có quyền gửi email. Vui lòng kiểm tra API key hoặc verify domain trong Resend.";
        }
      } else if (emailResponse.status === 422) {
        errorMessage = "Email không hợp lệ hoặc thiếu thông tin. Vui lòng kiểm tra cấu hình.";
      }
      
      return new Response(
        JSON.stringify({ 
          error: errorMessage,
          details: emailResponse.status === 401 ? "HTTP 401: Unauthorized - RESEND_API_KEY invalid or missing" : errorData
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error sending OTP email:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

