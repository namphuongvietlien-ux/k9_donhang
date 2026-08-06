-- =====================================================
-- RBAC System: Add Enum Values
-- Migration: Add new enum values for app_role
-- This must be in a separate migration file because
-- PostgreSQL requires enum values to be committed before use
-- =====================================================

-- Add new enum values if they don't exist
-- Note: PostgreSQL doesn't allow DROP enum values, so we keep 'admin' and 'user' for backward compatibility
DO $$ 
BEGIN
  -- Add super_admin
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'super_admin' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'super_admin';
  END IF;
  
  -- Add manager
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'manager' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'manager';
  END IF;
  
  -- Add staff
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'staff' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'staff';
  END IF;
END $$;

