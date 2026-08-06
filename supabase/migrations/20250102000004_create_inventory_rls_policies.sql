-- =====================================================
-- INVENTORY & ACCOUNTING SYSTEM - PHASE 1
-- Create Row Level Security (RLS) policies
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_in_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_in_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_out_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_out_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;

-- Suppliers policies
CREATE POLICY "Admins can manage suppliers"
ON public.suppliers
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Customers policies
CREATE POLICY "Admins can manage customers"
ON public.customers
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can view their own customer record
CREATE POLICY "Users can view their own customer record"
ON public.customers
FOR SELECT
USING (auth.uid() = user_id);

-- Stock in transactions policies
CREATE POLICY "Admins can manage stock in transactions"
ON public.stock_in_transactions
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Stock in items policies
CREATE POLICY "Admins can manage stock in items"
ON public.stock_in_items
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Stock out transactions policies
CREATE POLICY "Admins can manage stock out transactions"
ON public.stock_out_transactions
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Stock out items policies
CREATE POLICY "Admins can manage stock out items"
ON public.stock_out_items
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Inventory lots policies
CREATE POLICY "Admins can manage inventory lots"
ON public.inventory_lots
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Inventory movements policies
CREATE POLICY "Admins can manage inventory movements"
ON public.inventory_movements
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Accounts payable policies
CREATE POLICY "Admins can manage accounts payable"
ON public.accounts_payable
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Supplier payments policies
CREATE POLICY "Admins can manage supplier payments"
ON public.supplier_payments
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Accounts receivable policies
CREATE POLICY "Admins can manage accounts receivable"
ON public.accounts_receivable
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Customer payments policies
CREATE POLICY "Admins can manage customer payments"
ON public.customer_payments
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

