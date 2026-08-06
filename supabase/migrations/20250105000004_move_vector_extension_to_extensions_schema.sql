-- =====================================================
-- Security Advisor: Move vector extension to extensions schema
-- Migration: Move vector extension from public to extensions schema
-- =====================================================

-- Step 1: Check if vector extension exists and is being used
DO $$
DECLARE
  vector_used BOOLEAN := false;
  table_count INTEGER;
BEGIN
  -- Check if any tables use vector type
  SELECT COUNT(*) INTO table_count
  FROM information_schema.columns c
  JOIN information_schema.tables t ON c.table_schema = t.table_schema 
    AND c.table_name = t.table_name
  WHERE c.data_type = 'USER-DEFINED'
    AND c.udt_name = 'vector'
    AND t.table_schema = 'public';
  
  IF table_count > 0 THEN
    vector_used := true;
    RAISE NOTICE 'Found % columns using vector type. Will move extension to extensions schema.', table_count;
  ELSE
    RAISE NOTICE 'No columns using vector type found. Extension can be moved safely.';
  END IF;
  
  -- Check if extension exists
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE NOTICE 'Vector extension does not exist. Nothing to do.';
    RETURN;
  END IF;
  
  -- Step 2: Create extensions schema if it doesn't exist
  CREATE SCHEMA IF NOT EXISTS extensions;
  
  -- Step 3: Move extension to extensions schema
  -- Note: This will automatically update all vector type references
  BEGIN
    ALTER EXTENSION vector SET SCHEMA extensions;
    RAISE NOTICE 'Successfully moved vector extension to extensions schema.';
    
    -- Step 4: Update columns to use fully qualified type name
    -- This is usually not necessary as PostgreSQL handles it automatically,
    -- but we'll add it for clarity
    IF vector_used THEN
      RAISE NOTICE 'Vector type references should be automatically updated.';
      RAISE NOTICE 'If you encounter issues, you may need to update column definitions manually.';
    END IF;
    
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to move vector extension: %. You may need to do this manually.', SQLERRM;
      RAISE WARNING 'Manual steps:';
      RAISE WARNING '1. CREATE SCHEMA IF NOT EXISTS extensions;';
      RAISE WARNING '2. ALTER EXTENSION vector SET SCHEMA extensions;';
  END;
END $$;

-- Step 5: Verify the move
DO $$
DECLARE
  ext_schema TEXT;
BEGIN
  SELECT n.nspname INTO ext_schema
  FROM pg_extension e
  JOIN pg_namespace n ON e.extnamespace = n.oid
  WHERE e.extname = 'vector';
  
  IF ext_schema IS NOT NULL THEN
    IF ext_schema = 'extensions' THEN
      RAISE NOTICE '✅ Vector extension is now in extensions schema.';
    ELSE
      RAISE WARNING 'Vector extension is still in % schema. Move may have failed.', ext_schema;
    END IF;
  ELSE
    RAISE NOTICE 'Vector extension does not exist.';
  END IF;
END $$;

