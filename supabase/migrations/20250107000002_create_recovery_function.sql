-- =====================================================
-- Emergency Recovery: Create Recovery Function
-- Migration: Create RPC function to restore super_admin role
-- =====================================================

-- Function to restore super_admin role (for emergency recovery)
-- This function allows authenticated users to restore their own role
-- if they match a predefined list of recovery emails
CREATE OR REPLACE FUNCTION public.restore_super_admin_role(
  user_email TEXT,
  recovery_code TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_user_id UUID;
  current_user_id UUID;
  allowed_emails TEXT[] := ARRAY[
    'nguyenthanhphatdeveloper@gmail.com'
    -- Add more recovery emails here if needed
  ];
BEGIN
  -- Get current authenticated user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Get target user ID from email
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = LOWER(TRIM(user_email))
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found: %', user_email;
  END IF;

  -- Verify that authenticated user matches target user
  IF current_user_id != target_user_id THEN
    RAISE EXCEPTION 'Can only restore your own role';
  END IF;

  -- Check if email is in allowed recovery list
  IF NOT (LOWER(TRIM(user_email)) = ANY(allowed_emails)) THEN
    RAISE EXCEPTION 'Email not authorized for recovery: %', user_email;
  END IF;

  -- Optional: Verify recovery code (if provided)
  -- For now, we'll skip this, but you can add it later
  -- IF recovery_code IS NOT NULL AND recovery_code != 'RECOVERY2025' THEN
  --   RAISE EXCEPTION 'Invalid recovery code';
  -- END IF;

  -- Remove any existing admin roles first
  DELETE FROM public.user_roles
  WHERE user_id = target_user_id
    AND role IN ('super_admin'::app_role, 'manager'::app_role, 'staff'::app_role, 'admin'::app_role);

  -- Insert super_admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'super_admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN TRUE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.restore_super_admin_role(TEXT, TEXT) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.restore_super_admin_role IS 'Emergency recovery function to restore super_admin role. Only works for predefined recovery emails.';
