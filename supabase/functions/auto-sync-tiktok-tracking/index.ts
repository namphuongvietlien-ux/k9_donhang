// Supabase Edge Function: Auto-sync TikTok tracking every 30 minutes
// This function should be called by a cron job (Supabase Cron or external service)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

interface SyncResult {
  order_id: string;
  tracking_code: string;
  phone_last_4: string;
  synced: boolean;
  error_message: string | null;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Call the database function to get orders that need syncing
    const { data: ordersToSync, error: dbError } = await supabase.rpc(
      "auto_sync_ecommerce_tracking"
    );

    if (dbError) {
      throw new Error(`Database error: ${dbError.message}`);
    }

    if (!ordersToSync || ordersToSync.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No orders need syncing",
          synced: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const results: SyncResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    // Sync each order
    for (const order of ordersToSync) {
      try {
        // Call jt-tracking Edge Function
        const jtTrackingUrl = `${supabaseUrl}/functions/v1/jt-tracking`;
        const jtResponse = await fetch(jtTrackingUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
            apikey: supabaseServiceKey,
          },
          body: JSON.stringify({
            trackingCode: order.tracking_code,
            phoneLast4: order.phone_last_4,
          }),
        });

        if (!jtResponse.ok) {
          throw new Error(
            `JT tracking failed: ${jtResponse.status} ${jtResponse.statusText}`
          );
        }

        const jtData = await jtResponse.json();
        const html = jtData.html;

        // Parse tracking data (simplified - you may need to import parseJTTracking)
        // For now, we'll just update the order's last_synced_at
        // Full parsing should be done in the frontend or another function

        // Update order sync status
        const { error: updateError } = await supabase
          .from("ecommerce_orders")
          .update({
            last_synced_at: new Date().toISOString(),
            sync_count: supabase.raw("sync_count + 1"),
          })
          .eq("id", order.order_id);

        if (updateError) {
          throw updateError;
        }

        results.push({
          order_id: order.order_id,
          tracking_code: order.tracking_code,
          phone_last_4: order.phone_last_4,
          synced: true,
          error_message: null,
        });

        successCount++;
      } catch (error) {
        errorCount++;
        results.push({
          order_id: order.order_id,
          tracking_code: order.tracking_code,
          phone_last_4: order.phone_last_4,
          synced: false,
          error_message:
            error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: `Synced ${successCount} orders, ${errorCount} errors`,
        total: ordersToSync.length,
        success: successCount,
        errors: errorCount,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in auto-sync-tiktok-tracking:", error);
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

