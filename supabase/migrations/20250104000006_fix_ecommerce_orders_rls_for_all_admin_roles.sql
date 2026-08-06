-- =====================================================
-- Fix RLS Policies for Ecommerce Tables
-- Migration: Update ecommerce RLS policies to allow all admin roles
-- (super_admin, manager, staff, admin) instead of just 'admin'
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage ecommerce_platforms" ON public.ecommerce_platforms;
DROP POLICY IF EXISTS "Admins can manage ecommerce_orders" ON public.ecommerce_orders;
DROP POLICY IF EXISTS "Admins can manage ecommerce_order_items" ON public.ecommerce_order_items;
DROP POLICY IF EXISTS "Admins can manage ecommerce_tracking_events" ON public.ecommerce_tracking_events;

-- Recreate policies using can_access_admin() function
-- This allows super_admin, manager, staff, and admin roles

CREATE POLICY "Admins can manage ecommerce_platforms"
ON public.ecommerce_platforms
FOR ALL
USING (public.can_access_admin(auth.uid()))
WITH CHECK (public.can_access_admin(auth.uid()));

CREATE POLICY "Admins can manage ecommerce_orders"
ON public.ecommerce_orders
FOR ALL
USING (public.can_access_admin(auth.uid()))
WITH CHECK (public.can_access_admin(auth.uid()));

CREATE POLICY "Admins can manage ecommerce_order_items"
ON public.ecommerce_order_items
FOR ALL
USING (public.can_access_admin(auth.uid()))
WITH CHECK (public.can_access_admin(auth.uid()));

CREATE POLICY "Admins can manage ecommerce_tracking_events"
ON public.ecommerce_tracking_events
FOR ALL
USING (public.can_access_admin(auth.uid()))
WITH CHECK (public.can_access_admin(auth.uid()));

-- Comments
COMMENT ON POLICY "Admins can manage ecommerce_platforms" ON public.ecommerce_platforms IS 
'Allows all admin roles (super_admin, manager, staff, admin) to manage ecommerce platforms';

COMMENT ON POLICY "Admins can manage ecommerce_orders" ON public.ecommerce_orders IS 
'Allows all admin roles (super_admin, manager, staff, admin) to manage ecommerce orders';

COMMENT ON POLICY "Admins can manage ecommerce_order_items" ON public.ecommerce_order_items IS 
'Allows all admin roles (super_admin, manager, staff, admin) to manage ecommerce order items';

COMMENT ON POLICY "Admins can manage ecommerce_tracking_events" ON public.ecommerce_tracking_events IS 
'Allows all admin roles (super_admin, manager, staff, admin) to manage ecommerce tracking events';

