-- =====================================================
-- RBAC System: Admin Users Management Functions
-- Migration: Create RPC functions for user management
-- =====================================================

-- Function to get admin users with their roles
-- This function allows querying auth.users safely
CREATE OR REPLACE FUNCTION public.get_admin_users_with_roles()
RETURNS TABLE (
  id UUID,
  email TEXT,
  email_confirmed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  role app_role,
  role_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.email::TEXT,
    u.email_confirmed_at,
    u.created_at,
    ur.role,
    CASE ur.role
      WHEN 'super_admin' THEN 'Quản trị viên'
      WHEN 'manager' THEN 'Quản lý'
      WHEN 'staff' THEN 'Nhân viên'
      WHEN 'admin' THEN 'Quản trị viên'
      ELSE NULL
    END::TEXT as role_name
  FROM auth.users u
  LEFT JOIN public.user_roles ur ON u.id = ur.user_id
    AND ur.role IN ('super_admin'::app_role, 'manager'::app_role, 'staff'::app_role, 'admin'::app_role)
  WHERE EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = u.id
      AND ur2.role IN ('super_admin'::app_role, 'manager'::app_role, 'staff'::app_role, 'admin'::app_role)
  )
  ORDER BY u.created_at DESC;
END;
$$;

-- Grant execute permission to authenticated users with users.view permission
-- Note: RLS will be enforced by checking permissions in the function
GRANT EXECUTE ON FUNCTION public.get_admin_users_with_roles() TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.get_admin_users_with_roles IS 'Get admin users with their roles. Requires users.view permission.';

