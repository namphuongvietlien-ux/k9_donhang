-- Security Fix: Prevent users from viewing other customers' sensitive data
-- This migration adds validation and restrictions for customer_phone and customer_address

-- 1. Create function to validate and auto-fill customer contact info from user profile
CREATE OR REPLACE FUNCTION public.validate_order_customer_info()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_profile RECORD;
BEGIN
  -- Only validate for authenticated users (not guest orders)
  IF NEW.user_id IS NOT NULL AND auth.uid() IS NOT NULL THEN
    -- Ensure user can only create orders for themselves (unless admin)
    IF NEW.user_id != auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'You can only create orders for yourself.';
    END IF;
    
    -- Get user's profile to auto-fill or validate customer info
    SELECT phone, address INTO user_profile
    FROM public.profiles
    WHERE user_id = NEW.user_id;
    
    -- If profile exists and customer info is provided, validate it matches
    IF user_profile IS NOT NULL THEN
      -- For non-admin users: auto-fill from profile or validate matches
      IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
        -- Auto-fill customer_phone from profile if not provided
        IF NEW.customer_phone IS NULL AND user_profile.phone IS NOT NULL THEN
          NEW.customer_phone := user_profile.phone;
        -- If provided, must match profile
        ELSIF NEW.customer_phone IS NOT NULL AND user_profile.phone IS NOT NULL THEN
          IF NEW.customer_phone != user_profile.phone THEN
            RAISE EXCEPTION 'Customer phone must match your profile. Please update your profile first.';
          END IF;
        END IF;
        
        -- Auto-fill customer_address from profile if not provided
        IF NEW.customer_address IS NULL AND user_profile.address IS NOT NULL THEN
          NEW.customer_address := user_profile.address;
        -- If provided, must match profile
        ELSIF NEW.customer_address IS NOT NULL AND user_profile.address IS NOT NULL THEN
          IF NEW.customer_address != user_profile.address THEN
            RAISE EXCEPTION 'Customer address must match your profile. Please update your profile first.';
          END IF;
        END IF;
      END IF;
      -- Admins can set any customer info
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 2. Create trigger to validate on INSERT
DROP TRIGGER IF EXISTS validate_order_customer_info_trigger ON public.orders;
CREATE TRIGGER validate_order_customer_info_trigger
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_customer_info();

-- 3. Update SELECT policy - users can only view their own orders, admins can view all
-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;

-- Create new SELECT policy
CREATE POLICY "Users can view their own orders"
ON public.orders
FOR SELECT
USING (
  -- Users can view their own orders
  auth.uid() = user_id
  OR
  -- Admins can view all orders
  public.has_role(auth.uid(), 'admin'::app_role)
);

-- 4. Note: RLS policies already ensure users can only see their own orders
-- The SELECT policy above prevents users from viewing other users' orders
-- Therefore, if a user can see an order, it's their own order, so they can see their own contact info
-- Admins can see all orders with full contact info (needed for order management)

-- 6. Update INSERT policy to enforce user_id = auth.uid()
-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.orders;

-- Create stricter INSERT policy
CREATE POLICY "Authenticated users can create orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  -- Users can only create orders for themselves
  auth.uid() = user_id
  OR
  -- Admins can create orders for any user
  public.has_role(auth.uid(), 'admin'::app_role)
);

-- 7. Create function to validate UPDATE operations
CREATE OR REPLACE FUNCTION public.validate_order_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- For non-admin users: prevent changing sensitive fields
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    -- Prevent changing user_id
    IF OLD.user_id != NEW.user_id THEN
      RAISE EXCEPTION 'You cannot change the order owner.';
    END IF;
    
    -- Prevent changing customer_phone
    IF (OLD.customer_phone IS NULL AND NEW.customer_phone IS NOT NULL) 
       OR (OLD.customer_phone IS NOT NULL AND NEW.customer_phone IS NULL)
       OR (OLD.customer_phone IS NOT NULL AND NEW.customer_phone IS NOT NULL AND OLD.customer_phone != NEW.customer_phone) THEN
      RAISE EXCEPTION 'You cannot change customer phone.';
    END IF;
    
    -- Prevent changing customer_address
    IF (OLD.customer_address IS NULL AND NEW.customer_address IS NOT NULL)
       OR (OLD.customer_address IS NOT NULL AND NEW.customer_address IS NULL)
       OR (OLD.customer_address IS NOT NULL AND NEW.customer_address IS NOT NULL AND OLD.customer_address != NEW.customer_address) THEN
      RAISE EXCEPTION 'You cannot change customer address.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 8. Create trigger for UPDATE validation
DROP TRIGGER IF EXISTS validate_order_update_trigger ON public.orders;
CREATE TRIGGER validate_order_update_trigger
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_update();

-- 9. Add UPDATE policy
DROP POLICY IF EXISTS "Users can update their own orders" ON public.orders;
CREATE POLICY "Users can update their own orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  -- Users can only update their own orders
  auth.uid() = user_id
  OR
  -- Admins can update any order
  public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  -- Users can only update their own orders
  auth.uid() = user_id
  OR
  -- Admins can update any order
  public.has_role(auth.uid(), 'admin'::app_role)
);

-- 10. Add comment to document the security measures
COMMENT ON TABLE public.orders IS 'Orders table with sensitive customer data. customer_phone and customer_address are protected by RLS policies and validation triggers.';
COMMENT ON COLUMN public.orders.customer_phone IS 'Customer phone number. Only visible to order owner and admins.';
COMMENT ON COLUMN public.orders.customer_address IS 'Customer address. Only visible to order owner and admins.';

