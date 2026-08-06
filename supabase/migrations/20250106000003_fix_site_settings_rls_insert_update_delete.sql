-- Fix Site Settings RLS: Add INSERT, UPDATE, DELETE policies
-- The merge migration only created SELECT policy, missing INSERT/UPDATE/DELETE

-- Drop existing policies to ensure idempotency
DROP POLICY IF EXISTS "Site settings access policy" ON public.site_settings;
DROP POLICY IF EXISTS "Admins can insert site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Admins can update site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Admins can delete site settings" ON public.site_settings;

-- SELECT: Anyone can view site settings OR admins can view all
CREATE POLICY "Site settings access policy"
ON public.site_settings
FOR SELECT
USING (
  true
  OR public.can_access_admin((select auth.uid()))
);

-- INSERT: Only admins can create site settings
CREATE POLICY "Admins can insert site settings"
ON public.site_settings
FOR INSERT
WITH CHECK (public.can_access_admin((select auth.uid())));

-- UPDATE: Only admins can update site settings
CREATE POLICY "Admins can update site settings"
ON public.site_settings
FOR UPDATE
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- DELETE: Only admins can delete site settings
CREATE POLICY "Admins can delete site settings"
ON public.site_settings
FOR DELETE
USING (public.can_access_admin((select auth.uid())));

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
