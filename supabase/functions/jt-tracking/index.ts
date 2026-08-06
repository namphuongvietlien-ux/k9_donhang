// Supabase Edge Function: J&T Express Tracking
// This function scrapes J&T Express website to get tracking information

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

interface JTTrackingRequest {
  trackingCode: string;
  phoneLast4: string;
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
    // Parse request body
    const { trackingCode, phoneLast4 }: JTTrackingRequest = await req.json();

    if (!trackingCode || !phoneLast4) {
      return new Response(
        JSON.stringify({ error: "Missing trackingCode or phoneLast4" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Call J&T Express tracking URL
    const url = `https://jtexpress.vn/vi/tracking?type=track&billcode=${encodeURIComponent(trackingCode)}&cellphone=${encodeURIComponent(phoneLast4)}`;
    
    console.log("Calling J&T Express:", url);
    
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(
          `J&T API error: ${response.status} ${response.statusText}`
        );
      }

      const html = await response.text();
      
      // Return HTML for parsing on frontend
      // Frontend will use parseJTTracking() to parse the HTML
      return new Response(JSON.stringify({ html, trackingCode }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (apiError) {
      // If API call fails, return error
      console.warn("J&T API call failed:", apiError);
      throw apiError;
    }
  } catch (error) {
    console.error("Error in jt-tracking function:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

