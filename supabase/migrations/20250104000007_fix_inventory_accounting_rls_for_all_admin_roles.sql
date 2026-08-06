-- =====================================================
-- RBAC System: Fix inventory & accounting RLS for all admin roles
-- Migration: Update RLS policies to use can_access_admin function
-- =====================================================

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Admins can manage suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Admins can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can manage stock in transactions" ON public.stock_in_transactions;
DROP POLICY IF EXISTS "Admins can manage stock in items" ON public.stock_in_items;
DROP POLICY IF EXISTS "Admins can manage stock out transactions" ON public.stock_out_transactions;
DROP POLICY IF EXISTS "Admins can manage stock out items" ON public.stock_out_items;
DROP POLICY IF EXISTS "Admins can manage inventory lots" ON public.inventory_lots;
DROP POLICY IF EXISTS "Admins can manage inventory movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Admins can manage accounts payable" ON public.accounts_payable;
DROP POLICY IF EXISTS "Admins can manage supplier payments" ON public.supplier_payments;
DROP POLICY IF EXISTS "Admins can manage accounts receivable" ON public.accounts_receivable;
DROP POLICY IF EXISTS "Admins can manage customer payments" ON public.customer_payments;

-- Create new policies using can_access_admin function
CREATE POLICY "Admins can manage suppliers"
ON public.suppliers
FOR ALL
USING (public.can_access_admin(auth.uid()))
WITH CHECK (public.can_access_admin(auth.uid()));

CREATE POLICY "Admins can manage customers"
ON public.customers
FOR ALL
USING (public.can_access_admin(auth.uid()))
WITH CHECK (public.can_access_admin(auth.uid()));

CREATE POLICY "Admins can manage stock in transactions"
ON public.stock_in_transactions
FOR ALL
USING (public.can_access_admin(auth.uid()))
WITH CHECK (public.can_access_admin(auth.uid()));

CREATE POLICY "Admins can manage stock in items"
ON public.stock_in_items
FOR ALL
USING (public.can_access_admin(auth.uid()))
WITH CHECK (public.can_access_admin(auth.uid()));

CREATE POLICY "Admins can manage stock out transactions"
ON public.stock_out_transactions
FOR ALL
USING (public.can_access_admin(auth.uid()))
WITH CHECK (public.can_access_admin(auth.uid()));

CREATE POLICY "Admins can manage stock out items"
ON public.stock_out_items
FOR ALL
USING (public.can_access_admin(auth.uid()))
WITH CHECK (public.can_access_admin(auth.uid()));

CREATE POLICY "Admins can manage inventory lots"
ON public.inventory_lots
FOR ALL
USING (public.can_access_admin(auth.uid()))
WITH CHECK (public.can_access_admin(auth.uid()));

CREATE POLICY "Admins can manage inventory movements"
ON public.inventory_movements
FOR ALL
USING (public.can_access_admin(auth.uid()))
WITH CHECK (public.can_access_admin(auth.uid()));

CREATE POLICY "Admins can manage accounts payable"
ON public.accounts_payable
FOR ALL
USING (public.can_access_admin(auth.uid()))
WITH CHECK (public.can_access_admin(auth.uid()));

CREATE POLICY "Admins can manage supplier payments"
ON public.supplier_payments
FOR ALL
USING (public.can_access_admin(auth.uid()))
WITH CHECK (public.can_access_admin(auth.uid()));

CREATE POLICY "Admins can manage accounts receivable"
ON public.accounts_receivable
FOR ALL
USING (public.can_access_admin(auth.uid()))
WITH CHECK (public.can_access_admin(auth.uid()));

CREATE POLICY "Admins can manage customer payments"
ON public.customer_payments
FOR ALL
USING (public.can_access_admin(auth.uid()))
WITH CHECK (public.can_access_admin(auth.uid()));

-- Comments
COMMENT ON POLICY "Admins can manage suppliers" ON public.suppliers IS 'Allows all admin roles to manage suppliers.';
COMMENT ON POLICY "Admins can manage customers" ON public.customers IS 'Allows all admin roles to manage customers.';
COMMENT ON POLICY "Admins can manage stock in transactions" ON public.stock_in_transactions IS 'Allows all admin roles to manage stock in transactions.';
COMMENT ON POLICY "Admins can manage stock in items" ON public.stock_in_items IS 'Allows all admin roles to manage stock in items.';
COMMENT ON POLICY "Admins can manage stock out transactions" ON public.stock_out_transactions IS 'Allows all admin roles to manage stock out transactions.';
COMMENT ON POLICY "Admins can manage stock out items" ON public.stock_out_items IS 'Allows all admin roles to manage stock out items.';
COMMENT ON POLICY "Admins can manage inventory lots" ON public.inventory_lots IS 'Allows all admin roles to manage inventory lots.';
COMMENT ON POLICY "Admins can manage inventory movements" ON public.inventory_movements IS 'Allows all admin roles to manage inventory movements.';
COMMENT ON POLICY "Admins can manage accounts payable" ON public.accounts_payable IS 'Allows all admin roles to manage accounts payable.';
COMMENT ON POLICY "Admins can manage supplier payments" ON public.supplier_payments IS 'Allows all admin roles to manage supplier payments.';
COMMENT ON POLICY "Admins can manage accounts receivable" ON public.accounts_receivable IS 'Allows all admin roles to manage accounts receivable.';
COMMENT ON POLICY "Admins can manage customer payments" ON public.customer_payments IS 'Allows all admin roles to manage customer payments.';

