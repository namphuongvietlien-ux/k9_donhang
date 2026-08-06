-- =====================================================
-- RBAC System: Fix get_user_permissions function
-- Migration: Ensure function returns empty array instead of NULL
-- =====================================================

-- Fix get_user_permissions to return empty array instead of NULL
CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY_AGG(DISTINCT p.code), ARRAY[]::TEXT[])
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON ur.role = rp.role
  JOIN public.permissions p ON rp.permission_id = p.id
  WHERE ur.user_id = _user_id
$$;

