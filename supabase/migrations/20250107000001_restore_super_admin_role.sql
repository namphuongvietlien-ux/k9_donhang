-- =====================================================
-- Emergency Recovery: Restore Super Admin Role
-- Migration: Restore super_admin role for nguyenthanhphatdeveloper@gmail.com
-- =====================================================

-- This migration restores the super_admin role for the specified email
-- Run this if a super admin accidentally removed their own role

DO $$
DECLARE
  super_admin_id UUID;
  user_email TEXT := 'nguyenthanhphatdeveloper@gmail.com';
BEGIN
  -- Get user ID from email
  SELECT id INTO super_admin_id
  FROM auth.users
  WHERE email = user_email
  LIMIT 1;

  -- If user exists, restore super_admin role
  IF super_admin_id IS NOT NULL THEN
    -- Remove any existing admin roles first (to avoid conflicts)
    DELETE FROM public.user_roles
    WHERE user_id = super_admin_id
      AND role IN ('super_admin'::app_role, 'manager'::app_role, 'staff'::app_role, 'admin'::app_role);
    
    -- Insert super_admin role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (super_admin_id, 'super_admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    
    RAISE NOTICE 'Super Admin role restored for: % (User ID: %)', user_email, super_admin_id;
  ELSE
    RAISE NOTICE 'User not found: %. Please ensure the user exists in auth.users table.', user_email;
  END IF;
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.can_access_admin IS 'Emergency recovery: Restore super_admin role for nguyenthanhphatdeveloper@gmail.com';
