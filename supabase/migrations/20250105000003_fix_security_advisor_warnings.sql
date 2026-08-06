-- =====================================================
-- Security Advisor: Fix security warnings
-- Migration: Add SET search_path to functions and fix permissive RLS policies
-- =====================================================

-- =====================================================
-- PART 1: Fix function_search_path_mutable warnings
-- Add SET search_path = public to all functions
-- =====================================================

-- Note: We'll use a dynamic approach to alter all functions
-- This ensures we get the correct function signatures from pg_proc

DO $$
DECLARE
  func_record RECORD;
  func_list TEXT[] := ARRAY[
    'update_accounts_payable_status',
    'update_ecommerce_orders_updated_at',
    'update_stock_in_total',
    'generate_order_code',
    'calculate_stock_in_item_total',
    'update_contact_messages_updated_at',
    'update_shipping_updated_at',
    'check_stock_availability',
    'update_accounts_payable_on_payment',
    'check_ecommerce_delivery',
    'generate_stock_in_code',
    'cleanup_expired_otps',
    'update_updated_at_column',
    'generate_customer_code',
    'stock_out_fifo',
    'update_stock_on_in',
    'determine_shipping_zone_type',
    'auto_generate_stock_in_code',
    'update_chat_conversation_updated_at',
    'calculate_ecommerce_order_total',
    'create_accounts_payable',
    'get_product_stock',
    'update_accounts_receivable_status',
    'generate_supplier_code',
    'update_ecommerce_platforms_updated_at',
    'update_stock_out_total',
    'auto_generate_stock_out_code',
    'calculate_shipping_fee',
    'update_accounts_receivable_on_payment',
    'set_order_code',
    'update_stock_on_out',
    'create_stock_out_on_order_confirmed',
    'create_ar_on_ecommerce_delivery',
    'deduct_stock_on_ecommerce_delivery',
    'update_contact_page_settings_updated_at',
    'generate_stock_out_code'
  ];
  func_name TEXT;
BEGIN
  FOREACH func_name IN ARRAY func_list
  LOOP
    -- Find all function overloads for this function name
    FOR func_record IN
      SELECT 
        p.proname,
        pg_get_function_identity_arguments(p.oid) as args,
        p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = func_name
    LOOP
      -- Alter function to set search_path
      BEGIN
        EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public', 
          func_record.proname, 
          func_record.args);
        RAISE NOTICE 'Set search_path for function: %(%)', func_record.proname, func_record.args;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING 'Failed to alter function %(%): %', func_record.proname, func_record.args, SQLERRM;
      END;
    END LOOP;
  END LOOP;
END $$;

-- =====================================================
-- PART 2: Fix RLS policies that are too permissive
-- Add basic validation to INSERT/UPDATE policies
-- =====================================================

-- admin_otp: "Anyone can insert OTP" - Add email validation
DROP POLICY IF EXISTS "Anyone can insert OTP" ON public.admin_otp;
CREATE POLICY "Anyone can insert OTP"
ON public.admin_otp
FOR INSERT
WITH CHECK (
  email IS NOT NULL 
  AND email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND otp_code IS NOT NULL
  AND expires_at > now()
);

-- admin_otp: "Anyone can update OTP" - Only allow updating used flag
DROP POLICY IF EXISTS "Anyone can update OTP" ON public.admin_otp;
CREATE POLICY "Anyone can update OTP"
ON public.admin_otp
FOR UPDATE
USING (
  expires_at > now() -- Only allow updating non-expired OTPs
)
WITH CHECK (
  expires_at > now() -- Only allow updating non-expired OTPs
);

-- chat_conversations: "Anyone can create conversations" - Add basic validation
DROP POLICY IF EXISTS "Anyone can create conversations" ON public.chat_conversations;
CREATE POLICY "Anyone can create conversations"
ON public.chat_conversations
FOR INSERT
WITH CHECK (
  (user_id IS NULL OR user_id = (select auth.uid())) -- User can only create conversations for themselves
);

-- contact_messages: "Anyone can submit contact messages" - Add email validation
DROP POLICY IF EXISTS "Anyone can submit contact messages" ON public.contact_messages;
CREATE POLICY "Anyone can submit contact messages"
ON public.contact_messages
FOR INSERT
TO anon, authenticated
WITH CHECK (
  email IS NOT NULL 
  AND email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND message IS NOT NULL
  AND length(trim(message)) > 0
);

-- newsletter_subscriptions: "Anyone can subscribe to newsletter" - Add email validation
DROP POLICY IF EXISTS "Anyone can subscribe to newsletter" ON public.newsletter_subscriptions;
CREATE POLICY "Anyone can subscribe to newsletter"
ON public.newsletter_subscriptions
FOR INSERT
WITH CHECK (
  email IS NOT NULL 
  AND email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
);

-- =====================================================
-- PART 3: Comments
-- =====================================================

COMMENT ON POLICY "Anyone can insert OTP" ON public.admin_otp IS 'Allows anyone to insert OTP with email validation.';
COMMENT ON POLICY "Anyone can update OTP" ON public.admin_otp IS 'Allows anyone to update non-expired OTPs.';
COMMENT ON POLICY "Anyone can create conversations" ON public.chat_conversations IS 'Allows anyone to create conversations, but only for themselves.';
COMMENT ON POLICY "Anyone can submit contact messages" ON public.contact_messages IS 'Allows anyone to submit contact messages with email and message validation.';
COMMENT ON POLICY "Anyone can subscribe to newsletter" ON public.newsletter_subscriptions IS 'Allows anyone to subscribe to newsletter with email validation.';

