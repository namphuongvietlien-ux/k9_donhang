-- =====================================================
-- Password Reset: Check Admin Email Function
-- Migration: Create RPC function to check if email has admin role
-- =====================================================

-- Function to check if an email has admin role (for password reset)
-- This function allows checking if an email is authorized for password reset
-- Only emails with admin roles can reset their password
CREATE OR REPLACE FUNCTION public.check_admin_email_exists(
  user_email TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  -- Get user ID from email
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = LOWER(TRIM(user_email))
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if user has any admin role
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = target_user_id
      AND role IN ('super_admin'::app_role, 'manager'::app_role, 'staff'::app_role, 'admin'::app_role)
  );
END;
$$;

-- Grant execute permission to authenticated and anon users (for password reset)
GRANT EXECUTE ON FUNCTION public.check_admin_email_exists(TEXT) TO authenticated, anon;

-- Add comment
COMMENT ON FUNCTION public.check_admin_email_exists IS 'Check if an email has admin role. Used for password reset authorization.';
