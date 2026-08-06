-- =====================================================
-- RBAC System: Fix storage RLS for all admin roles
-- Migration: Update storage policies to use can_access_admin function
-- =====================================================

-- Note: Storage policies need to be dropped manually in Supabase Dashboard
-- or via Supabase CLI with service_role key due to permission restrictions.
-- This migration will attempt to drop, but if it fails, policies must be
-- dropped manually before running this migration.

-- Attempt to drop existing storage policies (may fail without proper permissions)
DO $$
BEGIN
  -- Drop existing storage policies for product-images if they exist
  DROP POLICY IF EXISTS "Admins can upload product images" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can update product images" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can delete product images" ON storage.objects;

  -- Drop existing storage policies for product-videos if they exist
  DROP POLICY IF EXISTS "Admins can upload product videos" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can update product videos" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can delete product videos" ON storage.objects;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Cannot drop storage policies. Please drop them manually in Supabase Dashboard: Storage > Policies, then re-run this migration.';
  WHEN OTHERS THEN
    RAISE NOTICE 'Error dropping storage policies: %. Please drop them manually in Supabase Dashboard: Storage > Policies, then re-run this migration.', SQLERRM;
END $$;

-- Recreate storage policies for product-images using can_access_admin function
DO $$
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Admins can upload product images" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can update product images" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can delete product images" ON storage.objects;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Cannot drop storage policies. Please drop them manually in Supabase Dashboard: Storage > Policies, then re-run this migration.';
  WHEN OTHERS THEN
    RAISE NOTICE 'Error dropping policies: %. Policies may need to be dropped manually.', SQLERRM;
END $$;

-- Create new policies (will fail if policies still exist - must drop manually first)
DO $$
BEGIN
  CREATE POLICY "Admins can upload product images"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images' 
    AND public.can_access_admin(auth.uid())
  );

  CREATE POLICY "Admins can update product images"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'product-images' 
    AND public.can_access_admin(auth.uid())
  );

  CREATE POLICY "Admins can delete product images"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'product-images' 
    AND public.can_access_admin(auth.uid())
  );
EXCEPTION
  WHEN duplicate_object THEN
    RAISE EXCEPTION 'Storage policies already exist. Please drop them manually in Supabase Dashboard: Storage > Policies, then re-run this migration.';
END $$;

-- Recreate storage policies for product-videos using can_access_admin function
DO $$
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Admins can upload product videos" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can update product videos" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can delete product videos" ON storage.objects;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Cannot drop storage policies. Please drop them manually in Supabase Dashboard: Storage > Policies, then re-run this migration.';
  WHEN OTHERS THEN
    RAISE NOTICE 'Error dropping policies: %. Policies may need to be dropped manually.', SQLERRM;
END $$;

-- Create new policies (will fail if policies still exist - must drop manually first)
DO $$
BEGIN
  CREATE POLICY "Admins can upload product videos"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'product-videos' 
    AND public.can_access_admin(auth.uid())
  );

  CREATE POLICY "Admins can update product videos"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'product-videos' 
    AND public.can_access_admin(auth.uid())
  );

  CREATE POLICY "Admins can delete product videos"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'product-videos' 
    AND public.can_access_admin(auth.uid())
  );
EXCEPTION
  WHEN duplicate_object THEN
    RAISE EXCEPTION 'Storage policies already exist. Please drop them manually in Supabase Dashboard: Storage > Policies, then re-run this migration.';
END $$;

-- Comments
COMMENT ON POLICY "Admins can upload product images" ON storage.objects IS 'Allows all admin roles to upload product images.';
COMMENT ON POLICY "Admins can update product images" ON storage.objects IS 'Allows all admin roles to update product images.';
COMMENT ON POLICY "Admins can delete product images" ON storage.objects IS 'Allows all admin roles to delete product images.';
COMMENT ON POLICY "Admins can upload product videos" ON storage.objects IS 'Allows all admin roles to upload product videos.';
COMMENT ON POLICY "Admins can update product videos" ON storage.objects IS 'Allows all admin roles to update product videos.';
COMMENT ON POLICY "Admins can delete product videos" ON storage.objects IS 'Allows all admin roles to delete product videos.';

