-- =====================================================
-- Performance Optimization: Fix RLS Init Plan Warnings
-- Migration: Wrap auth.uid() and auth.role() in (select ...) to optimize performance
-- 
-- This migration fixes the "Auth RLS Initialization Plan" warnings from Supabase
-- Performance Advisor by wrapping auth functions in subqueries, preventing
-- unnecessary re-evaluation for each row.
-- =====================================================

-- =====================================================
-- PART 1: Fix policies using can_access_admin(auth.uid())
-- =====================================================

-- Products
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
CREATE POLICY "Admins can manage products"
ON public.products
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- Ecommerce tables
DROP POLICY IF EXISTS "Admins can manage ecommerce_platforms" ON public.ecommerce_platforms;
CREATE POLICY "Admins can manage ecommerce_platforms"
ON public.ecommerce_platforms
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage ecommerce_orders" ON public.ecommerce_orders;
CREATE POLICY "Admins can manage ecommerce_orders"
ON public.ecommerce_orders
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage ecommerce_order_items" ON public.ecommerce_order_items;
CREATE POLICY "Admins can manage ecommerce_order_items"
ON public.ecommerce_order_items
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage ecommerce_tracking_events" ON public.ecommerce_tracking_events;
CREATE POLICY "Admins can manage ecommerce_tracking_events"
ON public.ecommerce_tracking_events
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- Inventory & Accounting tables
DROP POLICY IF EXISTS "Admins can manage suppliers" ON public.suppliers;
CREATE POLICY "Admins can manage suppliers"
ON public.suppliers
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage customers" ON public.customers;
CREATE POLICY "Admins can manage customers"
ON public.customers
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage stock in transactions" ON public.stock_in_transactions;
CREATE POLICY "Admins can manage stock in transactions"
ON public.stock_in_transactions
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage stock in items" ON public.stock_in_items;
CREATE POLICY "Admins can manage stock in items"
ON public.stock_in_items
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage stock out transactions" ON public.stock_out_transactions;
CREATE POLICY "Admins can manage stock out transactions"
ON public.stock_out_transactions
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage stock out items" ON public.stock_out_items;
CREATE POLICY "Admins can manage stock out items"
ON public.stock_out_items
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage inventory lots" ON public.inventory_lots;
CREATE POLICY "Admins can manage inventory lots"
ON public.inventory_lots
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage inventory movements" ON public.inventory_movements;
CREATE POLICY "Admins can manage inventory movements"
ON public.inventory_movements
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage accounts payable" ON public.accounts_payable;
CREATE POLICY "Admins can manage accounts payable"
ON public.accounts_payable
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage supplier payments" ON public.supplier_payments;
CREATE POLICY "Admins can manage supplier payments"
ON public.supplier_payments
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage accounts receivable" ON public.accounts_receivable;
CREATE POLICY "Admins can manage accounts receivable"
ON public.accounts_receivable
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage customer payments" ON public.customer_payments;
CREATE POLICY "Admins can manage customer payments"
ON public.customer_payments
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- =====================================================
-- PART 2: Fix policies using auth.uid() directly
-- =====================================================

-- Profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
USING ((select auth.uid()) = id)
WITH CHECK ((select auth.uid()) = id);

-- Orders
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders"
ON public.orders
FOR SELECT
USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.orders;
CREATE POLICY "Authenticated users can create orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) = user_id
  OR
  public.can_access_admin((select auth.uid()))
);

DROP POLICY IF EXISTS "Users can update their own orders" ON public.orders;
CREATE POLICY "Users can update their own orders"
ON public.orders
FOR UPDATE
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
CREATE POLICY "Admins can view all orders"
ON public.orders
FOR SELECT
USING (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
CREATE POLICY "Admins can update orders"
ON public.orders
FOR UPDATE
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Guest can view order by code and phone" ON public.orders;
CREATE POLICY "Guest can view order by code and phone"
ON public.orders
FOR SELECT
USING (
  ((select auth.uid()) IS NULL AND user_id IS NULL AND order_code IS NOT NULL)
  OR
  ((select auth.uid()) = user_id)
  OR
  (public.can_access_admin((select auth.uid())))
);

-- Order Items
DROP POLICY IF EXISTS "Users can view their order items" ON public.order_items;
CREATE POLICY "Users can view their order items"
ON public.order_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.id = order_items.order_id 
    AND orders.user_id = (select auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can insert their own order items" ON public.order_items;
CREATE POLICY "Users can insert their own order items"
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

DROP POLICY IF EXISTS "Admins can view all order items" ON public.order_items;
CREATE POLICY "Admins can view all order items"
ON public.order_items
FOR SELECT
USING (public.can_access_admin((select auth.uid())));

-- Customers
DROP POLICY IF EXISTS "Users can view their own customer record" ON public.customers;
CREATE POLICY "Users can view their own customer record"
ON public.customers
FOR SELECT
USING ((select auth.uid()) = user_id);

-- Product Reviews
DROP POLICY IF EXISTS "Users can insert their own reviews" ON public.product_reviews;
CREATE POLICY "Users can insert their own reviews"
ON public.product_reviews
FOR INSERT
WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own reviews" ON public.product_reviews;
CREATE POLICY "Users can update their own reviews"
ON public.product_reviews
FOR UPDATE
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins can manage all reviews" ON public.product_reviews;
CREATE POLICY "Admins can manage all reviews"
ON public.product_reviews
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- Chat
DROP POLICY IF EXISTS "Users can view own conversations" ON public.chat_conversations;
CREATE POLICY "Users can view own conversations"
ON public.chat_conversations
FOR SELECT
USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own conversations" ON public.chat_conversations;
CREATE POLICY "Users can update own conversations"
ON public.chat_conversations
FOR UPDATE
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own messages" ON public.chat_messages;
CREATE POLICY "Users can view own messages"
ON public.chat_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chat_conversations
    WHERE chat_conversations.id = chat_messages.conversation_id
    AND chat_conversations.user_id = (select auth.uid())
  )
);

DROP POLICY IF EXISTS "Anyone can insert messages" ON public.chat_messages;
CREATE POLICY "Anyone can insert messages"
ON public.chat_messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chat_conversations
    WHERE chat_conversations.id = chat_messages.conversation_id
    AND chat_conversations.user_id = (select auth.uid())
  )
);

-- =====================================================
-- PART 3: Fix policies using has_role() function
-- =====================================================

-- Note: has_role() is a SECURITY DEFINER function, so wrapping auth.uid() 
-- inside it should be sufficient. However, we need to check if the function
-- itself uses auth.uid() internally. Since has_role() takes _user_id as parameter,
-- we just need to wrap the auth.uid() call when passing it.

-- User Roles
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Super admins can view all roles" ON public.user_roles;
CREATE POLICY "Super admins can view all roles"
ON public.user_roles
FOR SELECT
USING (
  public.has_role((select auth.uid()), 'super_admin'::app_role)
  OR public.has_role((select auth.uid()), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Super admins can insert roles" ON public.user_roles;
CREATE POLICY "Super admins can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (
  public.has_role((select auth.uid()), 'super_admin'::app_role)
  OR public.has_role((select auth.uid()), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Super admins can update roles" ON public.user_roles;
CREATE POLICY "Super admins can update roles"
ON public.user_roles
FOR UPDATE
USING (
  public.has_role((select auth.uid()), 'super_admin'::app_role)
  OR public.has_role((select auth.uid()), 'admin'::app_role)
)
WITH CHECK (
  public.has_role((select auth.uid()), 'super_admin'::app_role)
  OR public.has_role((select auth.uid()), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Super admins can delete roles" ON public.user_roles;
CREATE POLICY "Super admins can delete roles"
ON public.user_roles
FOR DELETE
USING (
  public.has_role((select auth.uid()), 'super_admin'::app_role)
  OR public.has_role((select auth.uid()), 'admin'::app_role)
);

-- Permissions
DROP POLICY IF EXISTS "Super admins can manage permissions" ON public.permissions;
CREATE POLICY "Super admins can manage permissions"
ON public.permissions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (select auth.uid())
      AND role = 'super_admin'::app_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (select auth.uid())
      AND role = 'super_admin'::app_role
  )
);

DROP POLICY IF EXISTS "Authenticated users can view permissions" ON public.permissions;
CREATE POLICY "Authenticated users can view permissions"
ON public.permissions
FOR SELECT
USING ((select auth.role()) = 'authenticated');

-- Role Permissions
DROP POLICY IF EXISTS "Super admins can manage role permissions" ON public.role_permissions;
CREATE POLICY "Super admins can manage role permissions"
ON public.role_permissions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (select auth.uid())
      AND role = 'super_admin'::app_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (select auth.uid())
      AND role = 'super_admin'::app_role
  )
);

DROP POLICY IF EXISTS "Authenticated users can view role permissions" ON public.role_permissions;
CREATE POLICY "Authenticated users can view role permissions"
ON public.role_permissions
FOR SELECT
USING ((select auth.role()) = 'authenticated');

-- =====================================================
-- PART 4: Fix admin policies for other tables
-- =====================================================

-- These tables use can_access_admin() but may also have other conditions
-- We'll fix the most critical ones based on the CSV warnings

-- Banners
DROP POLICY IF EXISTS "Admins can manage banners" ON public.banners;
CREATE POLICY "Admins can manage banners"
ON public.banners
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- Posts
DROP POLICY IF EXISTS "Admins can manage posts" ON public.posts;
CREATE POLICY "Admins can manage posts"
ON public.posts
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- Page Contents
DROP POLICY IF EXISTS "Admins can manage page contents" ON public.page_contents;
CREATE POLICY "Admins can manage page contents"
ON public.page_contents
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- Site Settings
DROP POLICY IF EXISTS "Admins can manage site settings" ON public.site_settings;
CREATE POLICY "Admins can manage site settings"
ON public.site_settings
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- Coupons
DROP POLICY IF EXISTS "Admins can manage coupons" ON public.coupons;
CREATE POLICY "Admins can manage coupons"
ON public.coupons
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- Categories
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
CREATE POLICY "Admins can manage categories"
ON public.categories
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- Admin OTP
DROP POLICY IF EXISTS "Admins can view OTP records" ON public.admin_otp;
CREATE POLICY "Admins can view OTP records"
ON public.admin_otp
FOR SELECT
USING (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can view all OTP records" ON public.admin_otp;
CREATE POLICY "Admins can view all OTP records"
ON public.admin_otp
FOR SELECT
USING (public.can_access_admin((select auth.uid())));

-- Shipping
DROP POLICY IF EXISTS "Admins can manage shipping zones" ON public.shipping_zones;
CREATE POLICY "Admins can manage shipping zones"
ON public.shipping_zones
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage shipping rates" ON public.shipping_rates;
CREATE POLICY "Admins can manage shipping rates"
ON public.shipping_rates
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- Newsletter
DROP POLICY IF EXISTS "Admins can view all newsletter subscriptions" ON public.newsletter_subscriptions;
CREATE POLICY "Admins can view all newsletter subscriptions"
ON public.newsletter_subscriptions
FOR SELECT
USING (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can update newsletter subscriptions" ON public.newsletter_subscriptions;
CREATE POLICY "Admins can update newsletter subscriptions"
ON public.newsletter_subscriptions
FOR UPDATE
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can delete newsletter subscriptions" ON public.newsletter_subscriptions;
CREATE POLICY "Admins can delete newsletter subscriptions"
ON public.newsletter_subscriptions
FOR DELETE
USING (public.can_access_admin((select auth.uid())));

-- Flash Sales
DROP POLICY IF EXISTS "Admins can manage flash sales" ON public.flash_sales;
CREATE POLICY "Admins can manage flash sales"
ON public.flash_sales
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage flash sale products" ON public.flash_sale_products;
CREATE POLICY "Admins can manage flash sale products"
ON public.flash_sale_products
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- Menu Items
DROP POLICY IF EXISTS "Admins can manage menu items" ON public.menu_items;
CREATE POLICY "Admins can manage menu items"
ON public.menu_items
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- Contact Messages
DROP POLICY IF EXISTS "Admins can view contact messages" ON public.contact_messages;
CREATE POLICY "Admins can view contact messages"
ON public.contact_messages
FOR SELECT
USING (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can update contact messages" ON public.contact_messages;
CREATE POLICY "Admins can update contact messages"
ON public.contact_messages
FOR UPDATE
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can delete contact messages" ON public.contact_messages;
CREATE POLICY "Admins can delete contact messages"
ON public.contact_messages
FOR DELETE
USING (public.can_access_admin((select auth.uid())));

-- Contact Page Settings
DROP POLICY IF EXISTS "Admins can update contact page settings" ON public.contact_page_settings;
CREATE POLICY "Admins can update contact page settings"
ON public.contact_page_settings
FOR UPDATE
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can insert contact page settings" ON public.contact_page_settings;
CREATE POLICY "Admins can insert contact page settings"
ON public.contact_page_settings
FOR INSERT
WITH CHECK (public.can_access_admin((select auth.uid())));

-- Product Knowledge
DROP POLICY IF EXISTS "Admins can manage product knowledge" ON public.product_knowledge;
CREATE POLICY "Admins can manage product knowledge"
ON public.product_knowledge
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- Product FAQs
DROP POLICY IF EXISTS "Admins can manage FAQs" ON public.product_faqs;
CREATE POLICY "Admins can manage FAQs"
ON public.product_faqs
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- Provinces
DROP POLICY IF EXISTS "Admins can manage provinces" ON public.provinces;
CREATE POLICY "Admins can manage provinces"
ON public.provinces
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- Platform Fee Types
DROP POLICY IF EXISTS "Admins can manage fee types" ON public.platform_fee_types;
CREATE POLICY "Admins can manage fee types"
ON public.platform_fee_types
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- Platform Fee Configs
DROP POLICY IF EXISTS "Admins can manage fee configs" ON public.platform_fee_configs;
CREATE POLICY "Admins can manage fee configs"
ON public.platform_fee_configs
FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

-- Comments
COMMENT ON POLICY "Admins can manage products" ON public.products IS 
'Optimized: Uses (select auth.uid()) to prevent re-evaluation for each row';

