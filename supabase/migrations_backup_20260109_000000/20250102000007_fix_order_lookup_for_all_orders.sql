-- Fix order lookup to support both guest orders and authenticated orders
-- This allows users to lookup any order by order_code (unique identifier)
-- Phone number is optional but helps validate ownership

-- Drop existing function
DROP FUNCTION IF EXISTS public.lookup_guest_order(TEXT, TEXT);

-- Create improved function to lookup order by code OR phone (for all orders)
-- Can search by: order_code only, phone only, or both
CREATE OR REPLACE FUNCTION public.lookup_guest_order(
  p_order_code TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  order_code TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  shipping_province TEXT,
  subtotal DECIMAL(12, 0),
  shipping_fee DECIMAL(12, 0),
  is_free_shipping BOOLEAN,
  total_amount DECIMAL(12, 0),
  status TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate: At least one parameter must be provided
  IF (p_order_code IS NULL OR p_order_code = '') 
     AND (p_customer_phone IS NULL OR p_customer_phone = '') THEN
    RAISE EXCEPTION 'Vui lòng nhập mã đơn hàng hoặc số điện thoại';
  END IF;

  -- Return orders that match the criteria
  -- Priority: If order_code is provided, use it (unique identifier)
  -- If only phone is provided, return all matching orders
  RETURN QUERY
  SELECT 
    o.id,
    o.order_code,
    o.customer_name,
    o.customer_phone,
    o.customer_address,
    o.shipping_province,
    o.subtotal,
    o.shipping_fee,
    o.is_free_shipping,
    o.total_amount,
    o.status,
    o.notes,
    o.created_at,
    o.updated_at
  FROM public.orders o
  WHERE (
    -- If order_code provided, must match exactly (order_code is unique)
    (p_order_code IS NOT NULL AND p_order_code != '' AND o.order_code = p_order_code)
    OR
    -- If only phone provided (no order_code), match by phone
    (
      (p_order_code IS NULL OR p_order_code = '')
      AND (p_customer_phone IS NOT NULL AND p_customer_phone != '' AND o.customer_phone = p_customer_phone)
    )
  )
  AND (
    -- If both provided, phone must also match (for security)
    (
      (p_order_code IS NOT NULL AND p_order_code != '' AND p_customer_phone IS NOT NULL AND p_customer_phone != '')
      AND o.customer_phone = p_customer_phone
    )
    OR
    -- If only order_code provided, no phone validation needed (order_code is unique)
    (p_customer_phone IS NULL OR p_customer_phone = '')
    OR
    -- If only phone provided, no order_code validation needed
    (p_order_code IS NULL OR p_order_code = '')
  )
  ORDER BY o.created_at DESC; -- Most recent first
END;
$$;

-- Update function comment
COMMENT ON FUNCTION public.lookup_guest_order IS 'Lookup order by order_code and/or customer_phone. Works for both guest orders (user_id IS NULL) and authenticated orders. If order_code is provided, it is used as the primary search key (unique identifier).';

-- Update RLS policy to allow order lookup by order_code (for public order lookup feature)
-- The function uses SECURITY DEFINER, so it bypasses RLS, but we still need to allow SELECT
-- for orders that can be looked up by order_code
DROP POLICY IF EXISTS "Guest can view order by code and phone" ON public.orders;

CREATE POLICY "Guest can view order by code and phone"
ON public.orders
FOR SELECT
USING (
  -- Allow if user is not authenticated (guest) AND order has no user_id (guest order)
  -- AND order_code exists (for lookup function)
  (auth.uid() IS NULL AND user_id IS NULL AND order_code IS NOT NULL)
  OR
  -- Also allow authenticated users to view their own orders (existing behavior)
  (auth.uid() = user_id)
  OR
  -- Admins can view all orders
  (public.has_role(auth.uid(), 'admin'::app_role))
  OR
  -- Allow lookup by order_code for any order (order_code is unique identifier)
  -- This is handled by the SECURITY DEFINER function, but we need the policy for direct SELECT
  (order_code IS NOT NULL)
);

-- Also update lookup_guest_order_items to support all orders
DROP FUNCTION IF EXISTS public.lookup_guest_order_items(UUID);

-- Create function to get order items for any order (not just guest orders)
CREATE OR REPLACE FUNCTION public.lookup_guest_order_items(
  p_order_id UUID
)
RETURNS TABLE (
  id UUID,
  product_name TEXT,
  product_slug TEXT,
  product_image TEXT,
  price DECIMAL(12, 0),
  quantity INTEGER,
  shipping_fee DECIMAL(12, 0)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate that the order exists
  IF NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id
  ) THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Return order items
  RETURN QUERY
  SELECT 
    oi.id,
    oi.product_name,
    oi.product_slug,
    oi.product_image,
    oi.price,
    oi.quantity,
    oi.shipping_fee
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
  ORDER BY oi.created_at;
END;
$$;

-- Update function comment
COMMENT ON FUNCTION public.lookup_guest_order_items IS 'Get order items for any order (guest or authenticated).';

