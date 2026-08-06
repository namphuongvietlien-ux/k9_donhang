-- Fix Flash Sales RLS: Add INSERT, UPDATE, DELETE policies
-- The merge migration only created SELECT policy, missing INSERT/UPDATE/DELETE

-- Drop all existing policies for flash_sales to ensure clean recreation
DROP POLICY IF EXISTS "Flash sales access policy" ON public.flash_sales;
DROP POLICY IF EXISTS "Admins can insert flash sales" ON public.flash_sales;
DROP POLICY IF EXISTS "Admins can update flash sales" ON public.flash_sales;
DROP POLICY IF EXISTS "Admins can delete flash sales" ON public.flash_sales;

-- Create comprehensive policies for flash_sales
-- SELECT: Anyone can view active flash sales OR upcoming flash sales OR admins can view all
CREATE POLICY "Flash sales access policy"
ON public.flash_sales
FOR SELECT
USING (
  (is_active = true AND (
    (now() >= starts_at AND now() <= ends_at) -- Active flash sales
    OR (now() < starts_at) -- Upcoming flash sales (sắp diễn ra)
  ))
  OR public.can_access_admin((select auth.uid()))
);

-- INSERT: Only admins can create flash sales
CREATE POLICY "Admins can insert flash sales"
ON public.flash_sales
FOR INSERT
WITH CHECK (public.can_access_admin((select auth.uid())));

-- UPDATE: Only admins can update flash sales
CREATE POLICY "Admins can update flash sales"
ON public.flash_sales
FOR UPDATE
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- DELETE: Only admins can delete flash sales
CREATE POLICY "Admins can delete flash sales"
ON public.flash_sales
FOR DELETE
USING (public.can_access_admin((select auth.uid())));

-- Fix Flash Sale Products RLS: Add INSERT, UPDATE, DELETE policies
-- Drop all existing policies for flash_sale_products to ensure clean recreation
DROP POLICY IF EXISTS "Flash sale products access policy" ON public.flash_sale_products;
DROP POLICY IF EXISTS "Admins can insert flash sale products" ON public.flash_sale_products;
DROP POLICY IF EXISTS "Admins can update flash sale products" ON public.flash_sale_products;
DROP POLICY IF EXISTS "Admins can delete flash sale products" ON public.flash_sale_products;

-- SELECT: Anyone can view flash sale products for active OR upcoming flash sales OR admins can view all
CREATE POLICY "Flash sale products access policy"
ON public.flash_sale_products
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.flash_sales
    WHERE flash_sales.id = flash_sale_products.flash_sale_id
    AND flash_sales.is_active = true
    AND (
      (flash_sales.starts_at <= now() AND flash_sales.ends_at > now()) -- Active
      OR (flash_sales.starts_at > now()) -- Upcoming
    )
  )
  OR public.can_access_admin((select auth.uid()))
);

-- INSERT: Only admins can create flash sale products
CREATE POLICY "Admins can insert flash sale products"
ON public.flash_sale_products
FOR INSERT
WITH CHECK (public.can_access_admin((select auth.uid())));

-- UPDATE: Only admins can update flash sale products
CREATE POLICY "Admins can update flash sale products"
ON public.flash_sale_products
FOR UPDATE
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- DELETE: Only admins can delete flash sale products
CREATE POLICY "Admins can delete flash sale products"
ON public.flash_sale_products
FOR DELETE
USING (public.can_access_admin((select auth.uid())));

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
