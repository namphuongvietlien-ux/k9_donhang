-- =====================================================
-- RBAC System: Create Test Users
-- Migration: Create sample users for testing RBAC system
-- Note: This is optional - only run if you need test users
-- =====================================================

-- This migration creates test users for RBAC testing
-- You can skip this if you want to use existing users

-- IMPORTANT: Before running this migration:
-- 1. Create users in Supabase Dashboard → Authentication → Users
-- 2. Update the emails below to match your test users
-- 3. Or comment out this migration if you don't need it

DO $$
DECLARE
  super_admin_id UUID;
  manager_id UUID;
  staff_id UUID;
  user_email TEXT;
BEGIN
  -- ============================================
  -- UPDATE THESE EMAILS TO MATCH YOUR TEST USERS
  -- ============================================
  -- Super Admin: Use your existing admin email or create new one
  user_email := 'nguyenthanhphatdeveloper@gmail.com'; -- Change this
  
  -- Get Super Admin user ID
  SELECT id INTO super_admin_id
  FROM auth.users
  WHERE email = user_email
  LIMIT 1;

  -- If Super Admin user exists, assign role
  IF super_admin_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (super_admin_id, 'super_admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    
    RAISE NOTICE 'Super Admin role assigned to: %', user_email;
  ELSE
    RAISE NOTICE 'Super Admin user not found: %. Please create user first or update email.', user_email;
  END IF;

  -- ============================================
  -- OPTIONAL: Create Manager and Staff test users
  -- Uncomment and update emails if needed
  -- ============================================
  
  -- Manager user (uncomment if you created this user)
  /*
  user_email := 'manager@test.com'; -- Change this
  SELECT id INTO manager_id
  FROM auth.users
  WHERE email = user_email
  LIMIT 1;

  IF manager_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (manager_id, 'manager'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    
    RAISE NOTICE 'Manager role assigned to: %', user_email;
  ELSE
    RAISE NOTICE 'Manager user not found: %. Please create user first or update email.', user_email;
  END IF;
  */

  -- Staff user (uncomment if you created this user)
  /*
  user_email := 'staff@test.com'; -- Change this
  SELECT id INTO staff_id
  FROM auth.users
  WHERE email = user_email
  LIMIT 1;

  IF staff_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (staff_id, 'staff'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    
    RAISE NOTICE 'Staff role assigned to: %', user_email;
  ELSE
    RAISE NOTICE 'Staff user not found: %. Please create user first or update email.', user_email;
  END IF;
  */

END $$;

-- Verify roles assignment
SELECT 
  u.email,
  ur.role,
  CASE ur.role
    WHEN 'super_admin' THEN 'Quản trị viên'
    WHEN 'manager' THEN 'Quản lý'
    WHEN 'staff' THEN 'Nhân viên'
    ELSE ur.role::text
  END as role_name,
  ur.created_at
FROM auth.users u
JOIN public.user_roles ur ON u.id = ur.user_id
WHERE ur.role IN ('super_admin', 'manager', 'staff', 'admin')
ORDER BY 
  CASE ur.role
    WHEN 'super_admin' THEN 1
    WHEN 'admin' THEN 1
    WHEN 'manager' THEN 2
    WHEN 'staff' THEN 3
  END,
  u.email;

