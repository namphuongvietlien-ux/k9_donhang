-- Same as scripts/sql-fix-profiles-rls-store-scope.sql
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.get_my_store_scope()
RETURNS TABLE (
  username text,
  warehouse_id uuid,
  warehouse_code text,
  warehouse_label text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.username::text,
    p.warehouse_id,
    w.code::text,
    COALESCE(
      NULLIF(trim(w.short_name), ''),
      NULLIF(trim(w.print_name), ''),
      NULLIF(trim(w.name), ''),
      w.code
    )::text AS warehouse_label
  FROM public.profiles p
  LEFT JOIN public.warehouses w ON w.id = p.warehouse_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_store_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_store_scope() TO anon;

NOTIFY pgrst, 'reload schema';
