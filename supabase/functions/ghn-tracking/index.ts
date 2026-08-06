// Supabase Edge Function: GHN (Giao Hàng Nhanh) Tracking
// This function scrapes GHN website to get tracking information

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

interface GHNTrackingRequest {
  trackingCode: string;
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
    const { trackingCode }: GHNTrackingRequest = await req.json();

    if (!trackingCode) {
      return new Response(
        JSON.stringify({ error: "Missing trackingCode" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Try multiple approaches to get GHN tracking data
    // 1. Try GHN official API endpoint (if available)
    // 2. Try direct HTML fetch (may only get shell for React SPA)
    // 3. Fallback to headless browser service if configured
    
    const ghnUrl = `https://donhang.ghn.vn/?order_code=${encodeURIComponent(trackingCode)}`;
    
    console.log("Calling GHN:", ghnUrl);
    
    try {
      // Approach 1: Try GHN official API endpoint (if available)
      // Note: This may require API key, but let's try first
      const ghnApiUrls = [
        `https://api.ghn.vn/api/v1/public/order/tracking?order_code=${encodeURIComponent(trackingCode)}`,
        `https://api.ghn.vn/v1/public/order/tracking?order_code=${encodeURIComponent(trackingCode)}`,
        `https://donhang.ghn.vn/api/tracking?order_code=${encodeURIComponent(trackingCode)}`,
      ];
      
      for (const ghnApiUrl of ghnApiUrls) {
        try {
          console.log("Trying GHN API endpoint:", ghnApiUrl);
          const apiResponse = await fetch(ghnApiUrl, {
            method: "GET",
            headers: {
              "Accept": "application/json",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          });
          
          console.log("GHN API response status:", apiResponse.status);
          
          if (apiResponse.ok) {
            const apiData = await apiResponse.json();
            console.log("GHN API response data:", JSON.stringify(apiData).substring(0, 500));
            
            // If API returns data, parse it and return HTML-like structure for frontend
            // Frontend will need to handle both API response and HTML parsing
            return new Response(JSON.stringify({ 
              html: JSON.stringify(apiData), // Pass as HTML for compatibility
              trackingCode,
              source: "api"
            }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          } else {
            console.log("GHN API endpoint failed with status:", apiResponse.status);
          }
        } catch (apiError) {
          console.log("GHN API endpoint error:", apiError);
        }
      }
      
      console.log("All GHN API endpoints failed, trying HTML fetch");
      
      // Approach 2: Try headless browser service if configured
      const scraperApiKey = Deno.env.get("SCRAPER_API_KEY");
      const browserlessToken = Deno.env.get("BROWSERLESS_TOKEN");
      
      if (scraperApiKey) {
        // Use ScraperAPI to render JavaScript
        const url = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(ghnUrl)}&render=true`;
        console.log("Using ScraperAPI to render JavaScript");
        
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });
        
        if (response.ok) {
          const html = await response.text();
          console.log("GHN HTML received (via ScraperAPI):", {
            length: html.length,
            hasOrderHistory: html.includes('order-history-container'),
          });
          
          return new Response(JSON.stringify({ html, trackingCode }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else if (browserlessToken) {
        // Use Browserless.io to render JavaScript
        const url = `https://chrome.browserless.io/content?token=${browserlessToken}`;
        console.log("Using Browserless.io to render JavaScript");
        
        const browserlessResponse = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: ghnUrl,
            waitFor: 3000, // Wait 3 seconds for JavaScript to render
          }),
        });
        
        if (browserlessResponse.ok) {
          const html = await browserlessResponse.text();
          console.log("GHN HTML received (via Browserless):", {
            length: html.length,
            hasOrderHistory: html.includes('order-history-container'),
          });
          
          return new Response(JSON.stringify({ html, trackingCode }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      
      // Approach 3: Try direct HTML fetch (may only get shell for React SPA)
      const response = await fetch(ghnUrl, {
        method: "GET",
        headers: {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://donhang.ghn.vn/",
          "Cache-Control": "no-cache",
        },
      });

      if (!response.ok) {
        throw new Error(
          `GHN API error: ${response.status} ${response.statusText}`
        );
      }

      const html = await response.text();
      
      // Check if HTML is just a shell (React SPA)
      if (html.length < 5000 && html.includes('<div id="root"></div>')) {
        console.warn("GHN HTML appears to be a React SPA shell. HTML length:", html.length);
        // Still return it, frontend will handle the empty result
      }
      
      // Debug: Log HTML structure
      console.log("GHN HTML received:", {
        length: html.length,
        hasOrderHistory: html.includes('order-history-container'),
        hasTableRowFirst: html.includes('table-row first'),
        hasCollapseText: html.includes('collapse-text'),
        sample: html.substring(0, 500)
      });
      
      // Return HTML for parsing on frontend
      // Frontend will use parseGHNTracking() to parse the HTML
      return new Response(JSON.stringify({ html, trackingCode }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (apiError) {
      // If API call fails, return error
      console.warn("GHN API call failed:", apiError);
      throw apiError;
    }
  } catch (error) {
    console.error("Error in ghn-tracking function:", error);
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

