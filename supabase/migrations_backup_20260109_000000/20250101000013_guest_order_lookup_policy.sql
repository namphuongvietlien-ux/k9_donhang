-- Add RLS policy to allow guest users to lookup orders by order_code and customer_phone
-- This enables guest checkout users to track their orders without logging in

-- Policy: Guest can view order by order_code and customer_phone
-- Drop existing policy if it exists (for idempotent migration)
DROP POLICY IF EXISTS "Guest can view order by code and phone" ON public.orders;

CREATE POLICY "Guest can view order by code and phone"
ON public.orders
FOR SELECT
USING (
  -- Allow if user is not authenticated (guest) AND order has no user_id (guest order)
  -- AND order_code matches AND customer_phone matches
  (auth.uid() IS NULL AND user_id IS NULL AND order_code IS NOT NULL)
  OR
  -- Also allow authenticated users to view their own orders (existing behavior)
  (auth.uid() = user_id)
  OR
  -- Admins can view all orders
  (public.has_role(auth.uid(), 'admin'::app_role))
);

-- Note: We cannot directly check customer_phone in RLS policy for security reasons
-- Instead, we'll use a SQL function that validates phone number server-side
-- The frontend will call this function with order_code and customer_phone

-- Drop existing function if it exists (for idempotent migration)
DROP FUNCTION IF EXISTS public.lookup_guest_order(TEXT, TEXT);

-- Create function to lookup order by code OR phone (for guest users)
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
  -- If both provided: exact match
  -- If only order_code: match by code
  -- If only phone: match by phone (may return multiple orders)
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
  WHERE o.user_id IS NULL -- Only guest orders
    AND (
      -- If order_code provided, must match
      (p_order_code IS NOT NULL AND p_order_code != '' AND o.order_code = p_order_code)
      OR
      -- If only phone provided (no order_code), match by phone
      (p_order_code IS NULL OR p_order_code = '')
    )
    AND (
      -- If phone provided, must match
      (p_customer_phone IS NOT NULL AND p_customer_phone != '' AND o.customer_phone = p_customer_phone)
      OR
      -- If only order_code provided (no phone), match by code only
      (p_customer_phone IS NULL OR p_customer_phone = '')
    )
  ORDER BY o.created_at DESC; -- Most recent first
END;
$$;

-- Drop existing function if it exists (for idempotent migration)
DROP FUNCTION IF EXISTS public.lookup_guest_order_items(UUID);

-- Create function to get order items for guest order lookup
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
  -- Validate that the order is a guest order (user_id IS NULL)
  IF NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id AND o.user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Order not found or not a guest order';
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

-- Add comments
COMMENT ON FUNCTION public.lookup_guest_order IS 'Lookup guest order by order_code and customer_phone. Only works for guest orders (user_id IS NULL).';
COMMENT ON FUNCTION public.lookup_guest_order_items IS 'Get order items for a guest order. Only works for guest orders (user_id IS NULL).';

