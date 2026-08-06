-- Create function to auto-sync tracking for TikTok orders every 30 minutes
-- This function will be called by pg_cron or a scheduled Edge Function

-- Function to sync tracking for orders that need updating
CREATE OR REPLACE FUNCTION public.auto_sync_ecommerce_tracking()
RETURNS TABLE (
  order_id UUID,
  tracking_code TEXT,
  phone_last_4 TEXT,
  synced BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_result RECORD;
BEGIN
  -- Find TikTok orders that:
  -- 1. Have phone_last_4 (required for J&T tracking)
  -- 2. Are not delivered or cancelled
  -- 3. Either never synced, or last synced more than 30 minutes ago
  FOR v_order IN
    SELECT 
      id,
      tracking_code,
      phone_last_4,
      status,
      last_synced_at
    FROM public.ecommerce_orders
    WHERE platform_code = 'tiktok'
      AND phone_last_4 IS NOT NULL
      AND LENGTH(phone_last_4) = 4
      AND status NOT IN ('delivered', 'cancelled')
      AND (
        last_synced_at IS NULL 
        OR last_synced_at < NOW() - INTERVAL '30 minutes'
      )
    ORDER BY 
      CASE WHEN last_synced_at IS NULL THEN 0 ELSE 1 END,
      created_at ASC
    LIMIT 50 -- Process max 50 orders per run to avoid timeout
  LOOP
    BEGIN
      -- Note: Actual API call must be done from Edge Function or external service
      -- This function only marks orders as needing sync
      -- The actual sync will be triggered by calling the Edge Function
      
      -- Update last_synced_at to prevent duplicate processing
      -- (even if sync fails, we don't want to retry immediately)
      UPDATE public.ecommerce_orders
      SET last_synced_at = NOW()
      WHERE id = v_order.id;
      
      -- Return order info for external sync service
      order_id := v_order.id;
      tracking_code := v_order.tracking_code;
      phone_last_4 := v_order.phone_last_4;
      synced := TRUE;
      error_message := NULL;
      
      RETURN NEXT;
      
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue with other orders
      order_id := v_order.id;
      tracking_code := v_order.tracking_code;
      phone_last_4 := v_order.phone_last_4;
      synced := FALSE;
      error_message := SQLERRM;
      
      RETURN NEXT;
    END;
  END LOOP;
  
  RETURN;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.auto_sync_ecommerce_tracking() TO authenticated;

-- Comment
COMMENT ON FUNCTION public.auto_sync_ecommerce_tracking() IS 'Finds TikTok orders that need tracking sync (not synced in last 30 minutes). Returns order info for external sync service.';

-- Note: To actually sync, you need to:
-- 1. Create a Supabase Edge Function that calls this function
-- 2. Use Supabase Cron (pg_cron extension) or external cron service to call the Edge Function every 30 minutes
-- 3. The Edge Function will call the jt-tracking Edge Function for each order

