-- =====================================================
-- INVENTORY & ACCOUNTING SYSTEM - PHASE 1
-- Create all tables for inventory management and accounting
-- =====================================================

-- 1. Create ENUM types
CREATE TYPE public.stock_in_type AS ENUM (
  'purchase',      -- Nhập từ nhà cung cấp
  'return',         -- Nhập hàng trả lại
  'adjustment',     -- Điều chỉnh
  'production'      -- Từ sản xuất (nếu có)
);

CREATE TYPE public.stock_out_type AS ENUM (
  'sale',              -- Xuất bán hàng
  'return_to_supplier', -- Trả nhà cung cấp
  'adjustment',        -- Điều chỉnh
  'damaged',           -- Hàng hỏng/hết hạn
  'sample'             -- Hàng mẫu/biếu tặng
);

-- 2. Create suppliers table
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE, -- Mã nhà cung cấp (VD: NCC001)
  name TEXT NOT NULL, -- Tên nhà cung cấp
  contact_person TEXT, -- Người liên hệ
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_code TEXT, -- Mã số thuế
  bank_account TEXT, -- Số tài khoản ngân hàng
  bank_name TEXT, -- Tên ngân hàng
  payment_terms INTEGER DEFAULT 30, -- Số ngày được nợ (mặc định 30 ngày)
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Create customers table (extended)
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Link với user nếu có
  code TEXT UNIQUE, -- Mã khách hàng (VD: KH001)
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_code TEXT, -- Mã số thuế (nếu là công ty)
  payment_terms INTEGER DEFAULT 0, -- Số ngày được nợ (0 = không cho nợ)
  credit_limit DECIMAL(15, 0) DEFAULT 0, -- Hạn mức công nợ
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Create stock_in_transactions table
CREATE TABLE public.stock_in_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE, -- Mã phiếu nhập (VD: PN20250101001)
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  type stock_in_type NOT NULL DEFAULT 'purchase',
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL, -- Nhà cung cấp
  reference_number TEXT, -- Số hóa đơn, chứng từ gốc
  reference_date DATE, -- Ngày hóa đơn
  total_amount DECIMAL(15, 0) NOT NULL DEFAULT 0, -- Tổng giá trị nhập
  is_paid BOOLEAN DEFAULT false, -- Đã thanh toán chưa
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Create stock_in_items table
CREATE TABLE public.stock_in_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_in_id UUID NOT NULL REFERENCES public.stock_in_transactions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(12, 0) NOT NULL DEFAULT 0, -- Giá nhập
  total_price DECIMAL(15, 0) NOT NULL DEFAULT 0, -- Thành tiền (quantity * unit_price)
  batch_number TEXT, -- Số lô (nếu quản lý theo lô)
  expiry_date DATE, -- Hạn sử dụng (nếu có)
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6. Create stock_out_transactions table
CREATE TABLE public.stock_out_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE, -- Mã phiếu xuất (VD: PX20250101001)
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  type stock_out_type NOT NULL DEFAULT 'sale',
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL, -- Link với đơn hàng nếu xuất bán
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL, -- Nhà cung cấp nếu trả hàng
  reference_number TEXT, -- Số chứng từ gốc
  total_cost DECIMAL(15, 0) NOT NULL DEFAULT 0, -- Tổng giá vốn
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 7. Create stock_out_items table
CREATE TABLE public.stock_out_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_out_id UUID NOT NULL REFERENCES public.stock_out_transactions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost DECIMAL(12, 0) NOT NULL DEFAULT 0, -- Giá vốn (tính theo FIFO)
  total_cost DECIMAL(15, 0) NOT NULL DEFAULT 0, -- Thành tiền
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 8. Create inventory_lots table (FIFO management)
CREATE TABLE public.inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  stock_in_item_id UUID REFERENCES public.stock_in_items(id) ON DELETE SET NULL, -- Link với lần nhập
  quantity INTEGER NOT NULL CHECK (quantity > 0), -- Số lượng còn lại trong lô này
  unit_price DECIMAL(12, 0) NOT NULL DEFAULT 0, -- Giá nhập của lô này
  batch_number TEXT, -- Số lô
  expiry_date DATE, -- Hạn sử dụng
  received_date DATE NOT NULL DEFAULT CURRENT_DATE, -- Ngày nhập
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 9. Create inventory_movements table (tracking)
CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES public.inventory_lots(id) ON DELETE CASCADE,
  stock_out_item_id UUID REFERENCES public.stock_out_items(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out')),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(12, 0) NOT NULL,
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 10. Create accounts_payable table
CREATE TABLE public.accounts_payable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  stock_in_id UUID REFERENCES public.stock_in_transactions(id) ON DELETE SET NULL, -- Link với phiếu nhập
  reference_number TEXT, -- Số hóa đơn
  reference_date DATE, -- Ngày hóa đơn
  due_date DATE NOT NULL, -- Ngày đáo hạn
  original_amount DECIMAL(15, 0) NOT NULL, -- Số tiền ban đầu
  paid_amount DECIMAL(15, 0) NOT NULL DEFAULT 0, -- Đã thanh toán
  remaining_amount DECIMAL(15, 0) NOT NULL, -- Còn nợ
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 11. Create supplier_payments table
CREATE TABLE public.supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accounts_payable_id UUID NOT NULL REFERENCES public.accounts_payable(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(15, 0) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'check', 'other')),
  bank_account TEXT, -- Tài khoản ngân hàng (nếu chuyển khoản)
  reference_number TEXT, -- Số chứng từ thanh toán
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 12. Create accounts_receivable table
CREATE TABLE public.accounts_receivable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL, -- Link với đơn hàng
  customer_name TEXT NOT NULL, -- Tên khách hàng (nếu không có customer_id)
  customer_phone TEXT,
  due_date DATE NOT NULL, -- Ngày đáo hạn
  original_amount DECIMAL(15, 0) NOT NULL, -- Số tiền ban đầu
  paid_amount DECIMAL(15, 0) NOT NULL DEFAULT 0, -- Đã thanh toán
  remaining_amount DECIMAL(15, 0) NOT NULL, -- Còn nợ
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 13. Create customer_payments table
CREATE TABLE public.customer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accounts_receivable_id UUID NOT NULL REFERENCES public.accounts_receivable(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(15, 0) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'check', 'other')),
  bank_account TEXT, -- Tài khoản ngân hàng (nếu chuyển khoản)
  reference_number TEXT, -- Số chứng từ thanh toán
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 14. Update products table with new columns
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS average_cost DECIMAL(12, 0) DEFAULT 0, -- Giá vốn bình quân
ADD COLUMN IF NOT EXISTS last_purchase_price DECIMAL(12, 0), -- Giá nhập lần cuối
ADD COLUMN IF NOT EXISTS min_stock_level INTEGER DEFAULT 0, -- Tồn kho tối thiểu
ADD COLUMN IF NOT EXISTS max_stock_level INTEGER, -- Tồn kho tối đa
ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'cái', -- Đơn vị tính
ADD COLUMN IF NOT EXISTS track_expiry BOOLEAN DEFAULT false, -- Có theo dõi hạn sử dụng không
ADD COLUMN IF NOT EXISTS track_batch BOOLEAN DEFAULT false; -- Có theo dõi số lô không

-- 15. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_suppliers_code ON public.suppliers(code);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON public.suppliers(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_customers_code ON public.customers(code);
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_in_code ON public.stock_in_transactions(code);
CREATE INDEX IF NOT EXISTS idx_stock_in_date ON public.stock_in_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_in_supplier ON public.stock_in_transactions(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_in_items_stock_in ON public.stock_in_items(stock_in_id);
CREATE INDEX IF NOT EXISTS idx_stock_in_items_product ON public.stock_in_items(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_out_code ON public.stock_out_transactions(code);
CREATE INDEX IF NOT EXISTS idx_stock_out_date ON public.stock_out_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_out_order ON public.stock_out_transactions(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_out_items_stock_out ON public.stock_out_items(stock_out_id);
CREATE INDEX IF NOT EXISTS idx_stock_out_items_product ON public.stock_out_items(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_product ON public.inventory_lots(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_product_received ON public.inventory_lots(product_id, received_date ASC);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_expiry ON public.inventory_lots(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_movements_lot ON public.inventory_movements(lot_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_date ON public.inventory_movements(movement_date DESC);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_supplier ON public.accounts_payable(supplier_id);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_due_date ON public.accounts_payable(due_date);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_status ON public.accounts_payable(status);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_ap ON public.supplier_payments(accounts_payable_id);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_customer ON public.accounts_receivable(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_order ON public.accounts_receivable(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_due_date ON public.accounts_receivable(due_date);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_status ON public.accounts_receivable(status);
CREATE INDEX IF NOT EXISTS idx_customer_payments_ar ON public.customer_payments(accounts_receivable_id);

-- 16. Create triggers for updated_at
CREATE TRIGGER update_suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_stock_in_transactions_updated_at
BEFORE UPDATE ON public.stock_in_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_stock_out_transactions_updated_at
BEFORE UPDATE ON public.stock_out_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inventory_lots_updated_at
BEFORE UPDATE ON public.inventory_lots
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_accounts_payable_updated_at
BEFORE UPDATE ON public.accounts_payable
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_accounts_receivable_updated_at
BEFORE UPDATE ON public.accounts_receivable
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

