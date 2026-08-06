-- Fix: "permission denied for table orders/site_settings"
-- + cho phép admin import điều chuyển (insert order_items khi user_id IS NULL)

-- 1) Table privileges for PostgREST roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public
  TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
  TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES
  TO anon, authenticated, service_role;

-- 2) Orders / order_items — admin bypass rõ ràng (can_access_admin)
DROP POLICY IF EXISTS "Orders access policy" ON public.orders;
CREATE POLICY "Orders access policy"
ON public.orders
FOR SELECT
USING (
  ((select auth.uid()) = user_id)
  OR ((select auth.uid()) IS NULL AND user_id IS NULL AND order_code IS NOT NULL)
  OR public.can_access_admin((select auth.uid()))
);

DROP POLICY IF EXISTS "Orders insert policy" ON public.orders;
CREATE POLICY "Orders insert policy"
ON public.orders
FOR INSERT
WITH CHECK (
  ((select auth.uid()) = user_id)
  OR (user_id IS NULL)
  OR public.can_access_admin((select auth.uid()))
);

DROP POLICY IF EXISTS "Orders update policy" ON public.orders;
CREATE POLICY "Orders update policy"
ON public.orders
FOR UPDATE
USING (
  ((select auth.uid()) = user_id)
  OR public.can_access_admin((select auth.uid()))
)
WITH CHECK (
  ((select auth.uid()) = user_id)
  OR public.can_access_admin((select auth.uid()))
);

DROP POLICY IF EXISTS "Order items access policy" ON public.order_items;
CREATE POLICY "Order items access policy"
ON public.order_items
FOR SELECT
USING (
  public.can_access_admin((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.user_id = (select auth.uid())
  )
);

DROP POLICY IF EXISTS "Order items insert policy" ON public.order_items;
CREATE POLICY "Order items insert policy"
ON public.order_items
FOR INSERT
WITH CHECK (
  public.can_access_admin((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        o.user_id = (select auth.uid())
        OR o.user_id IS NULL
      )
  )
);

-- 3) site_settings — đảm bảo admin ghi được
DROP POLICY IF EXISTS "Site settings access policy" ON public.site_settings;
DROP POLICY IF EXISTS "Admins can insert site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Admins can update site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Admins can delete site settings" ON public.site_settings;

CREATE POLICY "Site settings access policy"
ON public.site_settings
FOR SELECT
USING (true);

CREATE POLICY "Admins can insert site settings"
ON public.site_settings
FOR INSERT
WITH CHECK (public.can_access_admin((select auth.uid())));

CREATE POLICY "Admins can update site settings"
ON public.site_settings
FOR UPDATE
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

CREATE POLICY "Admins can delete site settings"
ON public.site_settings
FOR DELETE
USING (public.can_access_admin((select auth.uid())));

-- 4) warehouses / stock — dùng can_access_admin (manager/staff cũng được)
DROP POLICY IF EXISTS "Admins can manage warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Authenticated can read warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "warehouses_admin_all" ON public.warehouses;
DROP POLICY IF EXISTS "warehouses_select_authenticated" ON public.warehouses;

CREATE POLICY "warehouses_select_authenticated"
ON public.warehouses
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "warehouses_admin_all"
ON public.warehouses
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage stock_on_hand" ON public.stock_on_hand;
DROP POLICY IF EXISTS "Authenticated can read stock_on_hand" ON public.stock_on_hand;
DROP POLICY IF EXISTS "stock_on_hand_admin_all" ON public.stock_on_hand;
DROP POLICY IF EXISTS "stock_on_hand_select_authenticated" ON public.stock_on_hand;

CREATE POLICY "stock_on_hand_select_authenticated"
ON public.stock_on_hand
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "stock_on_hand_admin_all"
ON public.stock_on_hand
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

NOTIFY pgrst, 'reload schema';
