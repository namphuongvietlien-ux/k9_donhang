-- =====================================================
-- RBAC System: Fix products RLS for all admin roles
-- Migration: Update RLS policies to use can_access_admin function
-- =====================================================

-- Drop existing policy if it exists (idempotent)
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;

-- Create new policy using can_access_admin function
-- This allows all admin roles (super_admin, manager, staff, admin) to manage products
CREATE POLICY "Admins can manage products"
ON public.products
FOR ALL
USING (public.can_access_admin(auth.uid()))
WITH CHECK (public.can_access_admin(auth.uid()));

-- Comments
COMMENT ON POLICY "Admins can manage products" ON public.products IS 'Allows all admin roles (super_admin, manager, staff, admin) to manage products.';

