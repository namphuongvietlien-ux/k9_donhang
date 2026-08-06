-- Chỉ phần RLS còn lỗi — dán & Run tiếp (phần A/B trước đó đã OK)
DROP POLICY IF EXISTS "Admins manage sales_vouchers" ON public.sales_vouchers;
CREATE POLICY "Admins manage sales_vouchers"
ON public.sales_vouchers FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins manage sales_voucher_items" ON public.sales_voucher_items;
CREATE POLICY "Admins manage sales_voucher_items"
ON public.sales_voucher_items FOR ALL
USING (public.can_access_admin((select auth.uid())))
WITH CHECK (public.can_access_admin((select auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_vouchers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_voucher_items TO authenticated;

NOTIFY pgrst, 'reload schema';
