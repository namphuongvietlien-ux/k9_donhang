-- =====================================================
-- RBAC System: 3-Level Role-Based Access Control
-- Migration: Create permissions and role-based access control
-- Note: Enum values must be added in a separate migration (20250104000000_add_rbac_enum_values.sql)
-- =====================================================

-- Step 1: Create permissions table
CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE, -- e.g., 'products.create', 'orders.view'
  name TEXT NOT NULL, -- e.g., 'Tạo sản phẩm', 'Xem đơn hàng'
  description TEXT,
  category TEXT NOT NULL, -- e.g., 'products', 'orders', 'inventory', 'users'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_permissions_code ON public.permissions(code);
CREATE INDEX IF NOT EXISTS idx_permissions_category ON public.permissions(category);

-- Enable RLS
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- Policy: Only super_admin can manage permissions
CREATE POLICY "Super admins can manage permissions"
ON public.permissions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'super_admin'::app_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'super_admin'::app_role
  )
);

-- Policy: All authenticated users can view permissions (for UI)
CREATE POLICY "Authenticated users can view permissions"
ON public.permissions
FOR SELECT
USING (auth.role() = 'authenticated');

-- Step 3: Create role_permissions table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  permission_id UUID REFERENCES public.permissions(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (role, permission_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON public.role_permissions(permission_id);

-- Enable RLS
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Policy: Only super_admin can manage role permissions
CREATE POLICY "Super admins can manage role permissions"
ON public.role_permissions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'super_admin'::app_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'super_admin'::app_role
  )
);

-- Policy: All authenticated users can view role permissions
CREATE POLICY "Authenticated users can view role permissions"
ON public.role_permissions
FOR SELECT
USING (auth.role() = 'authenticated');

-- Step 3: Create helper functions

-- Function to check if user has a specific permission
CREATE OR REPLACE FUNCTION public.has_permission(
  _user_id UUID,
  _permission_code TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role = rp.role
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = _user_id
      AND p.code = _permission_code
  )
$$;

-- Function to get user's admin role (super_admin, manager, or staff)
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
    AND role IN ('super_admin'::app_role, 'manager'::app_role, 'staff'::app_role)
  ORDER BY 
    CASE role
      WHEN 'super_admin'::app_role THEN 1
      WHEN 'manager'::app_role THEN 2
      WHEN 'staff'::app_role THEN 3
    END
  LIMIT 1
$$;

-- Function to check if user can access admin panel
CREATE OR REPLACE FUNCTION public.can_access_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin'::app_role, 'manager'::app_role, 'staff'::app_role, 'admin'::app_role)
  )
$$;

-- Function to get user's permissions (returns array of permission codes)
CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY_AGG(DISTINCT p.code)
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON ur.role = rp.role
  JOIN public.permissions p ON rp.permission_id = p.id
  WHERE ur.user_id = _user_id
$$;

-- Step 4: Insert default permissions
INSERT INTO public.permissions (code, name, description, category) VALUES
-- Products
('products.view', 'Xem sản phẩm', 'Xem danh sách và chi tiết sản phẩm', 'products'),
('products.create', 'Tạo sản phẩm', 'Tạo sản phẩm mới', 'products'),
('products.update', 'Sửa sản phẩm', 'Cập nhật thông tin sản phẩm', 'products'),
('products.delete', 'Xóa sản phẩm', 'Xóa sản phẩm', 'products'),
('products.pricing', 'Quản lý giá vốn & lợi nhuận', 'Xem và cập nhật giá vốn, lợi nhuận', 'products'),

-- Orders
('orders.view', 'Xem đơn hàng', 'Xem danh sách và chi tiết đơn hàng', 'orders'),
('orders.update', 'Cập nhật đơn hàng', 'Cập nhật trạng thái đơn hàng', 'orders'),
('orders.delete', 'Xóa đơn hàng', 'Xóa đơn hàng', 'orders'),

-- Inventory
('inventory.view', 'Xem tồn kho', 'Xem thông tin tồn kho', 'inventory'),
('inventory.stock_in', 'Nhập kho', 'Tạo phiếu nhập kho', 'inventory'),
('inventory.stock_out', 'Xuất kho', 'Tạo phiếu xuất kho', 'inventory'),
('inventory.reports', 'Báo cáo kho', 'Xem và export báo cáo kho', 'inventory'),

-- Accounts
('accounts.view', 'Xem công nợ', 'Xem công nợ phải trả và phải thu', 'accounts'),
('accounts.payable', 'Quản lý công nợ phải trả', 'Ghi nhận thanh toán nhà cung cấp', 'accounts'),
('accounts.receivable', 'Quản lý công nợ phải thu', 'Ghi nhận thanh toán khách hàng', 'accounts'),
('accounts.reports', 'Báo cáo công nợ', 'Xem và export báo cáo công nợ', 'accounts'),

-- Ecommerce Orders
('ecommerce.view', 'Xem đơn ecommerce', 'Xem danh sách đơn hàng ecommerce', 'ecommerce'),
('ecommerce.create', 'Tạo đơn ecommerce', 'Tạo đơn hàng ecommerce mới', 'ecommerce'),
('ecommerce.update', 'Cập nhật đơn ecommerce', 'Cập nhật thông tin đơn hàng ecommerce', 'ecommerce'),
('ecommerce.sync', 'Sync tracking', 'Đồng bộ tracking từ API', 'ecommerce'),
('ecommerce.reports', 'Báo cáo ecommerce', 'Xem và export báo cáo ecommerce', 'ecommerce'),
('ecommerce.settlement', 'Ghi nhận thanh toán ecommerce', 'Ghi nhận settlement cho đơn ecommerce', 'ecommerce'),

-- Content
('content.view', 'Xem nội dung', 'Xem bài viết, banner, homepage', 'content'),
('content.manage', 'Quản lý nội dung', 'Tạo, sửa, xóa nội dung', 'content'),

-- Marketing
('marketing.coupons', 'Quản lý mã giảm giá', 'Tạo, sửa, xóa mã giảm giá', 'marketing'),
('marketing.flash_sales', 'Quản lý flash sales', 'Tạo, sửa, xóa flash sales', 'marketing'),

-- Reports
('reports.view', 'Xem báo cáo', 'Xem các báo cáo', 'reports'),
('reports.export', 'Export báo cáo', 'Xuất báo cáo ra file', 'reports'),

-- Users & Settings
('users.view', 'Xem users', 'Xem danh sách users', 'users'),
('users.manage', 'Quản lý users', 'Tạo, sửa, xóa users và roles', 'users'),
('settings.view', 'Xem cài đặt', 'Xem cài đặt hệ thống', 'settings'),
('settings.manage', 'Quản lý cài đặt', 'Cập nhật cài đặt hệ thống', 'settings'),

-- Dashboard
('dashboard.view', 'Xem dashboard', 'Xem dashboard tổng quan', 'dashboard')
ON CONFLICT (code) DO NOTHING;

-- Step 5: Assign permissions to roles

-- Super Admin: All permissions
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'super_admin'::app_role, id
FROM public.permissions
ON CONFLICT (role, permission_id) DO NOTHING;

-- Manager: Most permissions except users and settings management
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'manager'::app_role, id
FROM public.permissions
WHERE code NOT IN ('users.manage', 'settings.manage')
ON CONFLICT (role, permission_id) DO NOTHING;

-- Staff: Limited permissions
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'staff'::app_role, id
FROM public.permissions
WHERE code IN (
  'dashboard.view',
  'orders.view',
  'orders.update',
  'inventory.view',
  'ecommerce.view',
  'ecommerce.create',
  'ecommerce.sync',
  'products.view'
)
ON CONFLICT (role, permission_id) DO NOTHING;

-- Step 6: Migrate existing 'admin' users to 'super_admin'
-- This ensures backward compatibility
UPDATE public.user_roles
SET role = 'super_admin'::app_role
WHERE role = 'admin'::app_role;

-- Step 7: Update RLS policies to support new roles
-- Note: Existing policies using has_role() will automatically work with new roles
-- But we need to update policies that explicitly check for 'admin'

-- Update user_roles policy to allow super_admin to view all roles
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Super admins can view all roles"
ON public.user_roles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin'::app_role, 'admin'::app_role)
  )
);

-- Update user_roles policy to allow super_admin to manage roles
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Super admins can manage roles"
ON public.user_roles
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin'::app_role, 'admin'::app_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin'::app_role, 'admin'::app_role)
  )
);

-- Add comment for documentation
COMMENT ON TABLE public.permissions IS 'Permissions table for RBAC system';
COMMENT ON TABLE public.role_permissions IS 'Many-to-many relationship between roles and permissions';
COMMENT ON FUNCTION public.has_permission IS 'Check if user has a specific permission';
COMMENT ON FUNCTION public.get_user_role IS 'Get user admin role (super_admin, manager, or staff)';
COMMENT ON FUNCTION public.can_access_admin IS 'Check if user can access admin panel';
COMMENT ON FUNCTION public.get_user_permissions IS 'Get all permissions for a user';

