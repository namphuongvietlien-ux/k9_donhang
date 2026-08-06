-- Fix Coupons RLS: Add INSERT, UPDATE, DELETE policies
-- The merge migration (20250105000002) only created SELECT policy, missing INSERT/UPDATE/DELETE
-- This migration adds the missing policies to allow admins to manage coupons

-- Drop all existing policies for coupons to ensure clean recreation
DROP POLICY IF EXISTS "Coupons access policy" ON public.coupons;
DROP POLICY IF EXISTS "Admins can insert coupons" ON public.coupons;
DROP POLICY IF EXISTS "Admins can update coupons" ON public.coupons;
DROP POLICY IF EXISTS "Admins can delete coupons" ON public.coupons;

-- SELECT: Anyone can view active coupons OR admins can view all
CREATE POLICY "Coupons access policy"
ON public.coupons
FOR SELECT
USING (
  (is_active = true)
  OR public.can_access_admin((select auth.uid()))
);

-- INSERT: Only admins can create coupons
CREATE POLICY "Admins can insert coupons"
ON public.coupons
FOR INSERT
WITH CHECK (public.can_access_admin((select auth.uid())));

-- UPDATE: Only admins can update coupons
CREATE POLICY "Admins can update coupons"
ON public.coupons
FOR UPDATE
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- DELETE: Only admins can delete coupons
CREATE POLICY "Admins can delete coupons"
ON public.coupons
FOR DELETE
USING (public.can_access_admin((select auth.uid())));

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
