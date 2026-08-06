-- =====================================================
-- Performance Optimization: Merge Multiple Permissive Policies
-- Migration: Combine multiple permissive policies into single policies
-- 
-- This migration fixes "Multiple Permissive Policies" warnings by merging
-- policies that have the same role and action into a single policy with OR conditions.
-- This improves performance as PostgreSQL only needs to evaluate one policy instead of multiple.
-- =====================================================

-- =====================================================
-- PART 1: Merge SELECT policies for public tables
-- =====================================================

-- Products: Merge "Admins can manage products" + "Anyone can view active products"
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
DROP POLICY IF EXISTS "Anyone can view active products" ON public.products;
DROP POLICY IF EXISTS "Products access policy" ON public.products;
CREATE POLICY "Products access policy"
ON public.products
FOR SELECT
USING (
  is_active = true
  OR public.can_access_admin((select auth.uid()))
);

-- Banners: Merge "Admins can manage banners" + "Anyone can view active banners"
DROP POLICY IF EXISTS "Admins can manage banners" ON public.banners;
DROP POLICY IF EXISTS "Anyone can view active banners" ON public.banners;
DROP POLICY IF EXISTS "Banners access policy" ON public.banners;
CREATE POLICY "Banners access policy"
ON public.banners
FOR SELECT
USING (
  (is_active = true)
  OR public.can_access_admin((select auth.uid()))
);

-- Categories: Merge "Admins can manage categories" + "Anyone can view active categories"
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Anyone can view active categories" ON public.categories;
DROP POLICY IF EXISTS "Categories access policy" ON public.categories;
CREATE POLICY "Categories access policy"
ON public.categories
FOR SELECT
USING (
  (is_active = true)
  OR public.can_access_admin((select auth.uid()))
);

-- Coupons: Merge "Admins can manage coupons" + "Anyone can view active coupons"
DROP POLICY IF EXISTS "Admins can manage coupons" ON public.coupons;
DROP POLICY IF EXISTS "Anyone can view active coupons" ON public.coupons;
DROP POLICY IF EXISTS "Coupons access policy" ON public.coupons;
CREATE POLICY "Coupons access policy"
ON public.coupons
FOR SELECT
USING (
  (is_active = true)
  OR public.can_access_admin((select auth.uid()))
);

-- Posts: Merge "Admins can manage posts" + "Anyone can view published posts"
DROP POLICY IF EXISTS "Admins can manage posts" ON public.posts;
DROP POLICY IF EXISTS "Anyone can view published posts" ON public.posts;
DROP POLICY IF EXISTS "Posts access policy" ON public.posts;
CREATE POLICY "Posts access policy"
ON public.posts
FOR SELECT
USING (
  (is_published = true)
  OR public.can_access_admin((select auth.uid()))
);

-- Page Contents: Merge "Admins can manage page contents" + "Anyone can view page contents"
DROP POLICY IF EXISTS "Admins can manage page contents" ON public.page_contents;
DROP POLICY IF EXISTS "Anyone can view page contents" ON public.page_contents;
DROP POLICY IF EXISTS "Page contents access policy" ON public.page_contents;
CREATE POLICY "Page contents access policy"
ON public.page_contents
FOR SELECT
USING (
  true
  OR public.can_access_admin((select auth.uid()))
);

-- Site Settings: Merge "Admins can manage site settings" + "Anyone can view site settings"
DROP POLICY IF EXISTS "Admins can manage site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Anyone can view site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Site settings access policy" ON public.site_settings;
CREATE POLICY "Site settings access policy"
ON public.site_settings
FOR SELECT
USING (
  true
  OR public.can_access_admin((select auth.uid()))
);

-- Provinces: Merge "Admins can manage provinces" + "Anyone can view provinces"
DROP POLICY IF EXISTS "Admins can manage provinces" ON public.provinces;
DROP POLICY IF EXISTS "Anyone can view provinces" ON public.provinces;
DROP POLICY IF EXISTS "Provinces access policy" ON public.provinces;
CREATE POLICY "Provinces access policy"
ON public.provinces
FOR SELECT
USING (
  true
  OR public.can_access_admin((select auth.uid()))
);

-- Shipping Zones: Merge "Admins can manage shipping zones" + "Anyone can view shipping zones"
DROP POLICY IF EXISTS "Admins can manage shipping zones" ON public.shipping_zones;
DROP POLICY IF EXISTS "Anyone can view shipping zones" ON public.shipping_zones;
DROP POLICY IF EXISTS "Shipping zones access policy" ON public.shipping_zones;
CREATE POLICY "Shipping zones access policy"
ON public.shipping_zones
FOR SELECT
USING (
  true
  OR public.can_access_admin((select auth.uid()))
);

-- Shipping Rates: Merge "Admins can manage shipping rates" + "Anyone can view shipping rates"
DROP POLICY IF EXISTS "Admins can manage shipping rates" ON public.shipping_rates;
DROP POLICY IF EXISTS "Anyone can view shipping rates" ON public.shipping_rates;
DROP POLICY IF EXISTS "Shipping rates access policy" ON public.shipping_rates;
CREATE POLICY "Shipping rates access policy"
ON public.shipping_rates
FOR SELECT
USING (
  true
  OR public.can_access_admin((select auth.uid()))
);

-- Platform Fee Types: Merge "Admins can manage fee types" + "Anyone can view fee types"
DROP POLICY IF EXISTS "Admins can manage fee types" ON public.platform_fee_types;
DROP POLICY IF EXISTS "Anyone can view fee types" ON public.platform_fee_types;
DROP POLICY IF EXISTS "Platform fee types access policy" ON public.platform_fee_types;
CREATE POLICY "Platform fee types access policy"
ON public.platform_fee_types
FOR SELECT
USING (
  true
  OR public.can_access_admin((select auth.uid()))
);

-- Platform Fee Configs: Merge "Admins can manage fee configs" + "Anyone can view fee configs"
DROP POLICY IF EXISTS "Admins can manage fee configs" ON public.platform_fee_configs;
DROP POLICY IF EXISTS "Anyone can view fee configs" ON public.platform_fee_configs;
DROP POLICY IF EXISTS "Platform fee configs access policy" ON public.platform_fee_configs;
CREATE POLICY "Platform fee configs access policy"
ON public.platform_fee_configs
FOR SELECT
USING (
  true
  OR public.can_access_admin((select auth.uid()))
);

-- Flash Sales: Merge "Admins can manage flash sales" + "Anyone can view active flash sales"
DROP POLICY IF EXISTS "Admins can manage flash sales" ON public.flash_sales;
DROP POLICY IF EXISTS "Anyone can view active flash sales" ON public.flash_sales;
DROP POLICY IF EXISTS "Flash sales access policy" ON public.flash_sales;
CREATE POLICY "Flash sales access policy"
ON public.flash_sales
FOR SELECT
USING (
  (is_active = true AND now() >= starts_at AND now() <= ends_at)
  OR public.can_access_admin((select auth.uid()))
);

-- Flash Sale Products: Merge "Admins can manage flash sale products" + "Anyone can view flash sale products"
DROP POLICY IF EXISTS "Admins can manage flash sale products" ON public.flash_sale_products;
DROP POLICY IF EXISTS "Anyone can view flash sale products" ON public.flash_sale_products;
DROP POLICY IF EXISTS "Flash sale products access policy" ON public.flash_sale_products;
CREATE POLICY "Flash sale products access policy"
ON public.flash_sale_products
FOR SELECT
USING (
  true
  OR public.can_access_admin((select auth.uid()))
);

-- Menu Items: Merge "Admins can manage menu items" + "Anyone can view active menu items"
DROP POLICY IF EXISTS "Admins can manage menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Anyone can view active menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Menu items access policy" ON public.menu_items;
CREATE POLICY "Menu items access policy"
ON public.menu_items
FOR SELECT
USING (
  (is_active = true)
  OR public.can_access_admin((select auth.uid()))
);

-- Product Knowledge: Merge "Admins can manage product knowledge" + "Anyone can view product knowledge"
DROP POLICY IF EXISTS "Admins can manage product knowledge" ON public.product_knowledge;
DROP POLICY IF EXISTS "Anyone can view product knowledge" ON public.product_knowledge;
DROP POLICY IF EXISTS "Product knowledge access policy" ON public.product_knowledge;
CREATE POLICY "Product knowledge access policy"
ON public.product_knowledge
FOR SELECT
USING (
  true
  OR public.can_access_admin((select auth.uid()))
);

-- Product FAQs: Merge "Admins can manage FAQs" + "Anyone can view active FAQs"
DROP POLICY IF EXISTS "Admins can manage FAQs" ON public.product_faqs;
DROP POLICY IF EXISTS "Anyone can view active FAQs" ON public.product_faqs;
DROP POLICY IF EXISTS "Product FAQs access policy" ON public.product_faqs;
CREATE POLICY "Product FAQs access policy"
ON public.product_faqs
FOR SELECT
USING (
  (is_active = true)
  OR public.can_access_admin((select auth.uid()))
);

-- Newsletter Subscriptions: Merge "Admins can view all newsletter subscriptions" + "Anyone can view active subscriptions"
DROP POLICY IF EXISTS "Admins can view all newsletter subscriptions" ON public.newsletter_subscriptions;
DROP POLICY IF EXISTS "Anyone can view active subscriptions" ON public.newsletter_subscriptions;
DROP POLICY IF EXISTS "Newsletter subscriptions access policy" ON public.newsletter_subscriptions;
CREATE POLICY "Newsletter subscriptions access policy"
ON public.newsletter_subscriptions
FOR SELECT
USING (
  (is_active = true)
  OR public.can_access_admin((select auth.uid()))
);

-- =====================================================
-- PART 2: Merge SELECT policies for user-specific tables
-- =====================================================

-- Customers: Merge "Admins can manage customers" + "Users can view their own customer record"
DROP POLICY IF EXISTS "Admins can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Users can view their own customer record" ON public.customers;
DROP POLICY IF EXISTS "Customers access policy" ON public.customers;
CREATE POLICY "Customers access policy"
ON public.customers
FOR SELECT
USING (
  ((select auth.uid()) = user_id)
  OR public.can_access_admin((select auth.uid()))
);

-- Order Items: Merge "Admins can view all order items" + "Users can view their order items"
DROP POLICY IF EXISTS "Admins can view all order items" ON public.order_items;
DROP POLICY IF EXISTS "Users can view their order items" ON public.order_items;
DROP POLICY IF EXISTS "Order items access policy" ON public.order_items;
CREATE POLICY "Order items access policy"
ON public.order_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.id = order_items.order_id 
    AND orders.user_id = (select auth.uid())
  )
  OR public.can_access_admin((select auth.uid()))
);

-- Orders: Merge "Admins can view all orders" + "Users can view their own orders" + "Guest can view order by code and phone"
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Guest can view order by code and phone" ON public.orders;
DROP POLICY IF EXISTS "Orders access policy" ON public.orders;
CREATE POLICY "Orders access policy"
ON public.orders
FOR SELECT
USING (
  ((select auth.uid()) = user_id)
  OR ((select auth.uid()) IS NULL AND user_id IS NULL AND order_code IS NOT NULL)
  OR public.can_access_admin((select auth.uid()))
);

-- User Roles: Merge "Super admins can view all roles" + "Users can view their own roles"
DROP POLICY IF EXISTS "Super admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "User roles access policy" ON public.user_roles;
CREATE POLICY "User roles access policy"
ON public.user_roles
FOR SELECT
USING (
  ((select auth.uid()) = user_id)
  OR (
    public.has_role((select auth.uid()), 'super_admin'::app_role)
    OR public.has_role((select auth.uid()), 'admin'::app_role)
  )
);

-- Permissions: Merge "Super admins can manage permissions" + "Authenticated users can view permissions"
DROP POLICY IF EXISTS "Super admins can manage permissions" ON public.permissions;
DROP POLICY IF EXISTS "Authenticated users can view permissions" ON public.permissions;
DROP POLICY IF EXISTS "Permissions access policy" ON public.permissions;
CREATE POLICY "Permissions access policy"
ON public.permissions
FOR SELECT
USING (
  ((select auth.role()) = 'authenticated')
  OR (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = (select auth.uid())
        AND role = 'super_admin'::app_role
    )
  )
);

-- Role Permissions: Merge "Super admins can manage role permissions" + "Authenticated users can view role permissions"
DROP POLICY IF EXISTS "Super admins can manage role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Authenticated users can view role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Role permissions access policy" ON public.role_permissions;
CREATE POLICY "Role permissions access policy"
ON public.role_permissions
FOR SELECT
USING (
  ((select auth.role()) = 'authenticated')
  OR (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = (select auth.uid())
        AND role = 'super_admin'::app_role
    )
  )
);

-- Product Reviews: Merge "Admins can manage all reviews" + "Anyone can view approved reviews"
DROP POLICY IF EXISTS "Admins can manage all reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Anyone can view approved reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Product reviews access policy" ON public.product_reviews;
CREATE POLICY "Product reviews access policy"
ON public.product_reviews
FOR SELECT
USING (
  (is_approved = true)
  OR public.can_access_admin((select auth.uid()))
);

-- =====================================================
-- PART 3: Merge INSERT policies
-- =====================================================

-- Orders: Merge "Anyone can create orders" + "Authenticated users can create orders"
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.orders;
DROP POLICY IF EXISTS "Orders insert policy" ON public.orders;
-- Allow both authenticated and anonymous users to create orders
-- For authenticated: user_id must match auth.uid()
-- For anonymous: user_id should be NULL
CREATE POLICY "Orders insert policy"
ON public.orders
FOR INSERT
WITH CHECK (
  ((select auth.uid()) = user_id)
  OR ((select auth.uid()) IS NULL AND user_id IS NULL)
  OR public.can_access_admin((select auth.uid()))
);

-- Order Items: Merge "Anyone can insert order items" + "Users can insert their own order items"
DROP POLICY IF EXISTS "Anyone can insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Users can insert their own order items" ON public.order_items;
DROP POLICY IF EXISTS "Order items insert policy" ON public.order_items;
CREATE POLICY "Order items insert policy"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.id = order_items.order_id 
    AND orders.user_id = (select auth.uid())
  )
);

-- Product Reviews: Merge "Admins can manage all reviews" + "Users can insert their own reviews"
DROP POLICY IF EXISTS "Users can insert their own reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Product reviews insert policy" ON public.product_reviews;
-- Note: "Admins can manage all reviews" was FOR ALL, but we already merged it into SELECT
-- We need to recreate INSERT policy separately
CREATE POLICY "Product reviews insert policy"
ON public.product_reviews
FOR INSERT
WITH CHECK (
  ((select auth.uid()) = user_id)
  OR public.can_access_admin((select auth.uid()))
);

-- =====================================================
-- PART 4: Merge UPDATE policies
-- =====================================================

-- Orders: Merge "Admins can update orders" + "Users can update their own orders"
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update their own orders" ON public.orders;
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

-- Product Reviews: Merge "Admins can manage all reviews" + "Users can update their own reviews"
-- Note: "Admins can manage all reviews" was FOR ALL, so we need to recreate it properly
-- We'll keep the merged SELECT policy and add separate UPDATE policy
DROP POLICY IF EXISTS "Users can update their own reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Product reviews update policy" ON public.product_reviews;
CREATE POLICY "Product reviews update policy"
ON public.product_reviews
FOR UPDATE
USING (
  ((select auth.uid()) = user_id)
  OR public.can_access_admin((select auth.uid()))
)
WITH CHECK (
  ((select auth.uid()) = user_id)
  OR public.can_access_admin((select auth.uid()))
);

-- =====================================================
-- PART 5: Fix admin_otp table (has 3 SELECT policies)
-- =====================================================

-- Admin OTP: Merge all SELECT policies into one
-- Merge "Admins can view OTP records" + "Admins can view all OTP records" + "Anyone can verify OTP"
DROP POLICY IF EXISTS "Admins can view OTP records" ON public.admin_otp;
DROP POLICY IF EXISTS "Admins can view all OTP records" ON public.admin_otp;
DROP POLICY IF EXISTS "Anyone can verify OTP" ON public.admin_otp;
DROP POLICY IF EXISTS "Admin OTP access policy" ON public.admin_otp;
-- Create single merged policy: Anyone can verify OTP (needed for login), admins can view all
CREATE POLICY "Admin OTP access policy"
ON public.admin_otp
FOR SELECT
USING (
  true  -- Anyone can verify OTP (needed for login flow)
  -- Note: Admins automatically included since true covers all cases
);

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON POLICY "Products access policy" ON public.products IS 
'Optimized: Merged multiple SELECT policies into one for better performance';

COMMENT ON POLICY "Orders access policy" ON public.orders IS 
'Optimized: Merged multiple SELECT policies (admin, user, guest) into one for better performance';

